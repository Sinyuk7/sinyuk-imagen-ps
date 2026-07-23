import { describe, expect, it } from 'vitest';
import { createComfyUiConnectionCoordinator } from './connection.js';
import { deriveComfyUiConnectionTarget, normalizeComfyUiBaseUrl } from './connection-target.js';
import { createComfyUiTestHarness, createInMemoryComfyUiStateRepository } from './repositories.js';
import type { ComfyUiConnectionErrorCode, ComfyUiConnectionPhase } from './types.js';

const policy = { requestTimeoutMs: 30_000, observationTimeoutMs: 300_000 };
const state = (baseUrl: string) => ({ baseUrl, selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('ComfyUI connection transaction', () => {
  it('derives every transport value from one explicit-scheme immutable target', () => {
    const target = deriveComfyUiConnectionTarget('http://127.0.0.1:8188/proxy///', policy);
    expect(target).toEqual({
      baseUrl: 'http://127.0.0.1:8188/proxy',
      origin: 'http://127.0.0.1:8188',
      probeUrl: 'http://127.0.0.1:8188/proxy/system_stats',
      frontendBaseUrl: 'http://127.0.0.1:8188/proxy',
      websocketUrl: 'ws://127.0.0.1:8188/proxy/ws',
      requestTimeoutMs: 30_000,
      observationTimeoutMs: 300_000,
    });
    expect(Object.isFrozen(target)).toBe(true);
    expect(deriveComfyUiConnectionTarget('http://localhost:8188', policy).origin).not.toBe(target.origin);
    expect(() => normalizeComfyUiBaseUrl('localhost:8188')).toThrow('must include http:// or https://');
    expect(() => normalizeComfyUiBaseUrl('http://user:secret@localhost:8188')).toThrow('unsupported URL fields');
    expect(() => normalizeComfyUiBaseUrl('http://localhost:8188?token=secret')).toThrow('unsupported URL fields');
    expect(() => normalizeComfyUiBaseUrl('http://localhost:8188/#secret')).toThrow('unsupported URL fields');
  });

  it('implements deterministic CAS without changing authoritative state on abort or conflict', async () => {
    const repository = createInMemoryComfyUiStateRepository(state('https://c.example'));
    const expected = await repository.load();
    const aborted = new AbortController();
    aborted.abort();
    await expect(repository.compareAndSave(expected, state('https://a.example'), aborted.signal)).resolves.toBe('aborted');
    await expect(repository.compareAndSave(state('https://wrong.example'), state('https://a.example'))).resolves.toBe('conflict');
    expect(await repository.load()).toEqual(state('https://c.example'));
    await expect(repository.compareAndSave(expected, state('https://a.example'))).resolves.toBe('committed');
    expect(await repository.load()).toEqual(state('https://a.example'));
  });

  it('runs API -> generation -> frontend -> Bridge -> CAS -> promotion and retires old active last', async () => {
    const harness = createComfyUiTestHarness(state('https://c.example'));
    const transitions = harness.records.transitions;
    const coordinator = createComfyUiConnectionCoordinator({
      ...harness.connectionPorts,
      invalidateRuntime() { transitions.push('invalidate'); },
      refreshActive() { transitions.push('refresh'); },
      now: () => 42,
    });
    await coordinator.recoverCommitted();
    transitions.length = 0;

    await expect(coordinator.connect('https://a.example/proxy')).resolves.toMatchObject({ ok: true });
    expect(transitions).toEqual([
      'api', 'generation', 'frontend', 'bridge', 'persistence', 'invalidate', 'refresh', 'retire', 'dispose',
    ]);
    expect(coordinator.getSnapshot()).toMatchObject({
      committedTarget: { baseUrl: 'https://a.example/proxy' },
      activeConnection: { target: { baseUrl: 'https://a.example/proxy' }, connectedAt: 42 },
    });
    expect((await harness.state.load())?.baseUrl).toBe('https://a.example/proxy');
  });

  it('keeps committed promotion successful when observers and post-promotion effects throw', async () => {
    const harness = createComfyUiTestHarness(state('https://c.example'));
    const baseFactory = harness.connectionPorts.generationFactory;
    const coordinator = createComfyUiConnectionCoordinator({
      ...harness.connectionPorts,
      generationFactory: {
        create(target) {
          const generation = baseFactory.create(target);
          if (target.baseUrl !== 'https://c.example') return generation;
          return { ...generation, retire() { throw new Error('synthetic retire failure'); } };
        },
      },
      invalidateRuntime() { throw new Error('synthetic invalidation failure'); },
      refreshActive() { throw new Error('synthetic refresh failure'); },
    });
    let successfulNotifications = 0;
    coordinator.subscribe(() => { throw new Error('synthetic observer failure'); });
    coordinator.subscribe(() => { successfulNotifications += 1; });
    await expect(coordinator.recoverCommitted()).resolves.toMatchObject({ ok: true });
    successfulNotifications = 0;

    await expect(coordinator.connect('https://a.example')).resolves.toMatchObject({
      ok: true,
      target: { baseUrl: 'https://a.example' },
    });
    expect(coordinator.getSnapshot()).toMatchObject({
      committedTarget: { baseUrl: 'https://a.example' },
      activeConnection: { target: { baseUrl: 'https://a.example' } },
    });
    expect((await harness.state.load())?.baseUrl).toBe('https://a.example');
    expect(successfulNotifications).toBeGreaterThan(0);
  });

  it('finishes linearized promotion before honoring a reentrant edit or owner abort', async () => {
    const harness = createComfyUiTestHarness();
    const coordinator = createComfyUiConnectionCoordinator(harness.connectionPorts);
    const owner = new AbortController();
    let reentered = false;
    coordinator.subscribe(() => {
      if (coordinator.getSnapshot().provisionalAttempt?.phase !== 'promotion' || reentered) return;
      reentered = true;
      coordinator.supersedeCurrentAttempt('https://draft-b.example');
      owner.abort();
    });

    await expect(coordinator.connect('https://attempt-a.example', owner.signal)).resolves.toMatchObject({
      ok: true,
      target: { baseUrl: 'https://attempt-a.example' },
    });
    expect(coordinator.getSnapshot()).toMatchObject({
      committedTarget: { baseUrl: 'https://attempt-a.example' },
      activeConnection: { target: { baseUrl: 'https://attempt-a.example' } },
      provisionalAttempt: undefined,
    });
    expect((await harness.state.load())?.baseUrl).toBe('https://attempt-a.example');
    expect(harness.records.transitions.filter((item) => item === 'dispose')).toHaveLength(0);

    await expect(coordinator.connect('https://draft-b.example')).resolves.toMatchObject({
      ok: true,
      target: { baseUrl: 'https://draft-b.example' },
    });
    expect(coordinator.getSnapshot().activeConnection?.target.baseUrl).toBe('https://draft-b.example');
  });

  it('defers reentrant host disposal until linearized promotion completes', async () => {
    const harness = createComfyUiTestHarness();
    const transitions = harness.records.transitions;
    const coordinator = createComfyUiConnectionCoordinator({
      ...harness.connectionPorts,
      invalidateRuntime() { transitions.push('invalidate'); },
      refreshActive() { transitions.push('refresh'); },
    });
    coordinator.subscribe(() => {
      if (coordinator.getSnapshot().provisionalAttempt?.phase === 'promotion') coordinator.dispose();
    });

    await expect(coordinator.connect('https://disposed.example')).resolves.toMatchObject({
      ok: true,
      target: { baseUrl: 'https://disposed.example' },
    });
    expect((await harness.state.load())?.baseUrl).toBe('https://disposed.example');
    expect(coordinator.getSnapshot()).toMatchObject({
      committedTarget: { baseUrl: 'https://disposed.example' },
      activeConnection: undefined,
      provisionalAttempt: undefined,
    });
    expect(transitions).not.toContain('invalidate');
    expect(transitions).not.toContain('refresh');
    expect(transitions.filter((item) => item === 'dispose')).toHaveLength(1);
    await expect(coordinator.connect('https://later.example')).resolves.toMatchObject({
      ok: false,
      error: { code: 'ABORTED' },
    });
  });

  it('maps initial persistence load failure and retries initialization on the next connect', async () => {
    const harness = createComfyUiTestHarness();
    let loadAttempts = 0;
    const coordinator = createComfyUiConnectionCoordinator({
      ...harness.connectionPorts,
      state: {
        ...harness.state,
        async load() {
          loadAttempts += 1;
          if (loadAttempts === 1) throw new Error('synthetic initial load failure');
          return harness.state.load();
        },
      },
    });

    await expect(coordinator.connect('https://retry.example')).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'PERSISTENCE_FAILED',
        phase: 'persistence',
        reason: 'initial-load-failed',
        target: { baseUrl: 'https://retry.example' },
      },
    });
    expect(coordinator.getSnapshot()).toMatchObject({
      lastFailure: { code: 'PERSISTENCE_FAILED', target: { baseUrl: 'https://retry.example' } },
    });
    expect(harness.records.apiTargets).toHaveLength(0);

    await expect(coordinator.connect('https://retry.example')).resolves.toMatchObject({ ok: true });
    expect(coordinator.getSnapshot()).toMatchObject({
      committedTarget: { baseUrl: 'https://retry.example' },
      activeConnection: { target: { baseUrl: 'https://retry.example' } },
      lastFailure: undefined,
    });
    expect((await harness.state.load())?.baseUrl).toBe('https://retry.example');
  });

  it('publishes deterministic attempt phases to subscribers', async () => {
    const harness = createComfyUiTestHarness();
    const coordinator = createComfyUiConnectionCoordinator(harness.connectionPorts);
    const phases: (ComfyUiConnectionPhase | 'connected')[] = [];
    const unsubscribe = coordinator.subscribe(() => {
      const current = coordinator.getSnapshot();
      phases.push(current.provisionalAttempt?.phase ?? (current.activeConnection ? 'connected' : 'api'));
    });
    await coordinator.connect('https://phase.example');
    unsubscribe();
    expect(phases).toEqual(['api', 'frontend', 'bridge', 'persistence', 'promotion', 'connected']);
  });

  it('supersedes A on draft B edit, suppresses late A, preserves active C, and does not auto-connect B', async () => {
    const harness = createComfyUiTestHarness(state('https://c.example'));
    const coordinator = createComfyUiConnectionCoordinator(harness.connectionPorts);
    await coordinator.recoverCommitted();
    const activeC = coordinator.getSnapshot().activeConnection;
    const gate = harness.deferApi();
    const pendingA = coordinator.connect('https://a.example/');
    await tick();
    coordinator.supersedeCurrentAttempt('https://b.example');
    gate.resolve();

    await expect(pendingA).resolves.toMatchObject({ ok: false, error: { code: 'SUPERSEDED' } });
    expect(coordinator.getSnapshot().activeConnection).toBe(activeC);
    expect(coordinator.getSnapshot().provisionalAttempt).toBeUndefined();
    expect((await harness.state.load())?.baseUrl).toBe('https://c.example');
    expect(harness.records.apiTargets.map((target) => target.baseUrl)).toEqual(['https://c.example', 'https://a.example']);
  });

  it('keeps an equivalent canonical draft attached to the current attempt', async () => {
    const harness = createComfyUiTestHarness();
    const coordinator = createComfyUiConnectionCoordinator(harness.connectionPorts);
    const gate = harness.deferApi();
    const pending = coordinator.connect('https://a.example/proxy/');
    await tick();
    coordinator.supersedeCurrentAttempt('https://a.example/proxy');
    expect(coordinator.getSnapshot().provisionalAttempt).toBeDefined();
    gate.resolve();
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('lets manual connect supersede startup recovery through the same coordinator', async () => {
    const harness = createComfyUiTestHarness(state('https://startup.example'));
    const coordinator = createComfyUiConnectionCoordinator(harness.connectionPorts);
    const startupGate = harness.deferApi();
    const startup = coordinator.recoverCommitted();
    await tick();
    const manual = coordinator.connect('https://manual.example');
    await expect(manual).resolves.toMatchObject({ ok: true, target: { baseUrl: 'https://manual.example' } });
    startupGate.resolve();
    await expect(startup).resolves.toMatchObject({ ok: false, error: { code: 'SUPERSEDED' } });
    expect(coordinator.getSnapshot().activeConnection?.target.baseUrl).toBe('https://manual.example');
  });

  it.each([
    ['API_UNREACHABLE', 'api'],
    ['API_INVALID_RESPONSE', 'api'],
    ['WEBVIEW_LOAD_FAILED', 'bridge'],
    ['BRIDGE_HANDSHAKE_TIMEOUT', 'bridge'],
    ['BRIDGE_CONTRACT_MISMATCH', 'bridge'],
  ] as const)('preserves public %s failure and old committed state', async (code, failingPhase) => {
    const harness = createComfyUiTestHarness(state('https://c.example'));
    const coordinator = createComfyUiConnectionCoordinator({
      ...harness.connectionPorts,
      async validateApi(target, signal) {
        if (failingPhase === 'api') throw { code, reason: 'contract-failed' };
        await harness.connectionPorts.validateApi(target, signal);
      },
      async validateBridge(generation, signal) {
        if (failingPhase === 'bridge') throw { code, reason: 'contract-failed' };
        await harness.connectionPorts.validateBridge(generation, signal);
      },
    });
    const result = await coordinator.connect('https://a.example');
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect((await harness.state.load())?.baseUrl).toBe('https://c.example');
  });

  it.each([
    ['load', 'WEBVIEW_LOAD_FAILED'],
    ['ready', 'WEBVIEW_LOAD_FAILED'],
    ['handshake', 'BRIDGE_HANDSHAKE_TIMEOUT'],
    ['contract', 'BRIDGE_CONTRACT_MISMATCH'],
  ] as const)('maps Resolver %s failure without flattening its meaning', async (phase, code) => {
    const harness = createComfyUiTestHarness();
    const coordinator = createComfyUiConnectionCoordinator({
      ...harness.connectionPorts,
      generationFactory: {
        create(target) {
          return {
            target,
            async resolve() {
              throw { name: 'ComfyUiFrontendBridgeResolutionError', phase, reason: phase === 'contract' ? 'protocol-mismatch' : 'timeout' };
            },
            retire() {},
            dispose() {},
          };
        },
      },
    });
    await expect(coordinator.connect('https://a.example')).resolves.toMatchObject({ ok: false, error: { code } });
  });

  it('maps persistence conflict, owner abort, and host disposal to bounded control results', async () => {
    const persistenceHarness = createComfyUiTestHarness(state('https://c.example'));
    const conflictState = {
      ...persistenceHarness.state,
      async compareAndSave() { return 'conflict' as const; },
    };
    const persistence = createComfyUiConnectionCoordinator({ ...persistenceHarness.connectionPorts, state: conflictState });
    await expect(persistence.connect('https://a.example')).resolves.toMatchObject({
      ok: false,
      error: { code: 'PERSISTENCE_FAILED', reason: 'compare-conflict' },
    });

    const abortHarness = createComfyUiTestHarness();
    const owner = new AbortController();
    const gate = abortHarness.deferApi();
    const aborted = createComfyUiConnectionCoordinator(abortHarness.connectionPorts);
    const pending = aborted.connect('https://a.example', owner.signal);
    await tick();
    owner.abort();
    gate.resolve();
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'ABORTED' } });
    aborted.dispose();
    aborted.dispose();
    expect(abortHarness.records.transitions.filter((item) => item === 'dispose')).toHaveLength(0);

    const activeHarness = createComfyUiTestHarness();
    const active = createComfyUiConnectionCoordinator(activeHarness.connectionPorts);
    await active.connect('https://active.example');
    active.dispose();
    active.dispose();
    expect(activeHarness.records.transitions.filter((item) => item === 'dispose')).toHaveLength(1);
  });

  it('keeps error code and phase unions exhaustive in contract tests', () => {
    const codes: readonly ComfyUiConnectionErrorCode[] = [
      'API_UNREACHABLE', 'API_INVALID_RESPONSE', 'WEBVIEW_LOAD_FAILED', 'BRIDGE_HANDSHAKE_TIMEOUT',
      'BRIDGE_CONTRACT_MISMATCH', 'PERSISTENCE_FAILED', 'SUPERSEDED', 'ABORTED',
    ];
    const phases: readonly ComfyUiConnectionPhase[] = ['api', 'frontend', 'bridge', 'persistence', 'promotion'];
    expect(codes).toHaveLength(8);
    expect(phases).toHaveLength(5);
  });
});

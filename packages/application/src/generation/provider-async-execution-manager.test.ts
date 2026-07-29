import { describe, expect, it, vi } from 'vitest';
import type { ProviderAsyncLifecycle, ProviderInvokeResult } from '@imagen-ps/providers';
import { createProviderAsyncExecutionManager } from './provider-async-execution-manager.js';

const result: ProviderInvokeResult = { assets: [], raw: { ok: true } };

function lifecycle(overrides: Partial<ProviderAsyncLifecycle<unknown, unknown>> = {}) {
  return {
    submit: vi.fn(async () => ({ status: 'pending' as const, remoteRef: 'remote-1', nextPollAfterMs: 1 })),
    poll: vi.fn(async () => ({ status: 'completed' as const, result })),
    ...overrides,
  } as ProviderAsyncLifecycle<unknown, unknown>;
}

function args(activeLifecycle: ProviderAsyncLifecycle<unknown, unknown>, signal?: AbortSignal) {
  return {
    jobId: 'job-1',
    lifecycle: activeLifecycle as never,
    invokeArgs: { config: {}, request: {}, ...(signal ? { signal } : {}) } as never,
  };
}

describe('ProviderAsyncExecutionManager', () => {
  it('submits once then polls one remote reference to completion', async () => {
    const sleep = vi.fn(async () => undefined);
    const active = lifecycle();
    const manager = createProviderAsyncExecutionManager({ sleep, minPollDelayMs: 1 });

    await expect(manager.execute(args(active))).resolves.toEqual(result);
    expect(active.submit).toHaveBeenCalledOnce();
    expect(active.poll).toHaveBeenCalledWith({ remoteRef: 'remote-1', signal: expect.any(AbortSignal) });
    expect(sleep).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  it('deduplicates concurrent execution for one job and rejects terminal re-entry', async () => {
    let releasePoll: (() => void) | undefined;
    const active = lifecycle({
      poll: vi.fn(() => new Promise((resolve: (value: { readonly status: 'completed'; readonly result: ProviderInvokeResult }) => void) => {
        releasePoll = () => resolve({ status: 'completed', result });
      })),
    });
    const manager = createProviderAsyncExecutionManager({ sleep: async () => undefined, minPollDelayMs: 1 });
    const first = manager.execute(args(active));
    const second = manager.execute(args(active));
    await vi.waitFor(() => expect(active.poll).toHaveBeenCalledOnce());
    expect(active.submit).toHaveBeenCalledOnce();
    releasePoll?.();
    await expect(Promise.all([first, second])).resolves.toEqual([result, result]);
    await expect(manager.execute(args(active))).rejects.toThrow('already been started');
    expect(active.submit).toHaveBeenCalledOnce();
  });

  it('re-polls the same remote reference when the Provider returns pending', async () => {
    const active = lifecycle({
      poll: vi
        .fn()
        .mockResolvedValueOnce({ status: 'pending' as const, nextPollAfterMs: 1 })
        .mockResolvedValueOnce({ status: 'completed' as const, result }),
    });
    const manager = createProviderAsyncExecutionManager({ sleep: async () => undefined, minPollDelayMs: 1 });

    await expect(manager.execute(args(active))).resolves.toEqual(result);
    expect(active.submit).toHaveBeenCalledOnce();
    expect(active.poll).toHaveBeenCalledTimes(2);
    expect(active.poll).toHaveBeenNthCalledWith(1, { remoteRef: 'remote-1', signal: expect.any(AbortSignal) });
    expect(active.poll).toHaveBeenNthCalledWith(2, { remoteRef: 'remote-1', signal: expect.any(AbortSignal) });
  });

  it('never resubmits when pending polling reaches budget', async () => {
    const active = lifecycle({ poll: vi.fn(async () => ({ status: 'pending' as const })) });
    const manager = createProviderAsyncExecutionManager({ sleep: async () => undefined, maxPolls: 1, minPollDelayMs: 1 });

    await expect(manager.execute(args(active))).rejects.toThrow('polling budget expired');
    expect(active.submit).toHaveBeenCalledOnce();
    expect(active.poll).toHaveBeenCalledOnce();
  });

  it('returns a terminal poll failure without resubmitting', async () => {
    const failure = new Error('remote task failed');
    const active = lifecycle({ poll: vi.fn(async () => ({ status: 'failed' as const, error: failure })) });
    const manager = createProviderAsyncExecutionManager({ sleep: async () => undefined, minPollDelayMs: 1 });

    await expect(manager.execute(args(active))).rejects.toThrow('remote task failed');
    expect(active.submit).toHaveBeenCalledOnce();
    expect(active.poll).toHaveBeenCalledOnce();
  });

  it('stops before submitting when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const active = lifecycle();
    const manager = createProviderAsyncExecutionManager({ sleep: async () => undefined });

    await expect(manager.execute(args(active, controller.signal))).rejects.toThrow('was aborted');
    expect(active.submit).not.toHaveBeenCalled();
  });

  it('disposes pending execution without retaining its in-flight entry', async () => {
    const sleep = vi.fn((_delayMs: number, signal?: AbortSignal) => new Promise<void>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('sleep aborted')), { once: true });
    }));
    const active = lifecycle();
    const manager = createProviderAsyncExecutionManager({ sleep, minPollDelayMs: 1 });

    const first = manager.execute(args(active));
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledOnce());
    manager.dispose();

    await expect(first).rejects.toThrow('sleep aborted');
    expect(active.poll).not.toHaveBeenCalled();
    await expect(manager.execute(args(active))).rejects.toThrow('has been disposed');
  });
});

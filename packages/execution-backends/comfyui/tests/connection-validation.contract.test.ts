import { describe, expect, it } from 'vitest';
import { COMFYUI_BRIDGE_LIMITS } from '../src/bridge.js';
import {
  createComfyUiFrontendBridgeResolutionError,
  type ComfyUiConnectionValidationErrorCode,
} from '../src/connection-validation.js';
import { executeComfyUiFrontendQueue } from '../src/drivers.js';
import type {
  ComfyUiBridgeIdentity,
  ComfyUiFrontendBridgePort,
  ComfyUiFrontendBridgeResolver,
  ComfyUiHttpResponse,
} from '../src/execution-types.js';
import { createComfyUiManagementHost } from '../src/management-host.js';

const encoder = new TextEncoder();
const connection = { baseUrl: 'https://example.test/proxy', requestTimeoutMs: 1_000, observationTimeoutMs: 1_000 };
const identity: ComfyUiBridgeIdentity = { origin: 'https://example.test', sourceId: 'source', loadId: 'load' };

function systemStats(value: unknown = {
  system: { comfyui_version: '0.3.50' },
  devices: [{ name: 'cpu' }],
}): ComfyUiHttpResponse {
  return { status: 200, headers: { 'content-type': 'application/json' }, body: encoder.encode(JSON.stringify(value)) };
}

function compatibleBridge(exchangeSignal?: (signal: AbortSignal | undefined) => void): ComfyUiFrontendBridgePort {
  return {
    identity,
    exchange: async (request, signal) => {
      exchangeSignal?.(signal);
      if (request.command === 'handshake') {
        return {
          requestId: request.requestId,
          ok: true,
          payload: {
            identity,
            protocolVersion: 1,
            bridgeVersion: '1.0.0',
            frontendVersion: '1.45.20',
            coreVersion: '0.27.1',
            capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true },
            limits: COMFYUI_BRIDGE_LIMITS,
          },
        };
      }
      return {
        requestId: request.requestId,
        ok: true,
        payload: { workflows: [{ workflowId: 'wf', displayName: 'WF', remotePath: 'wf.json', revision: 'r1' }] },
      };
    },
  };
}

async function expectCode(promise: Promise<unknown>, code: ComfyUiConnectionValidationErrorCode, reason?: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: 'ComfyUiConnectionValidationError',
    code,
    ...(reason === undefined ? {} : { reason }),
  });
}

describe('ComfyUI connection validation contracts', () => {
  it('validates bounded /system_stats and preserves exact target and signal', async () => {
    const owner = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const host = createComfyUiManagementHost({
      httpTransport: {
        request: async (request, signal) => {
          expect(request).toEqual({
            origin: connection.baseUrl,
            method: 'GET',
            path: '/system_stats',
            timeoutMs: connection.requestTimeoutMs,
            maxResponseBytes: 65_536,
          });
          observedSignal = signal;
          return systemStats();
        },
      },
    });

    await expect(host.validateApi(connection, owner.signal)).resolves.toEqual({
      status: 'ready',
      comfyUiVersion: '0.3.50',
      deviceCount: 1,
    });
    expect(observedSignal).toBe(owner.signal);
  });

  it.each([
    ['status', { ...systemStats(), status: 503 }, 'status-invalid'],
    ['body size', { ...systemStats(), body: new Uint8Array(65_537) }, 'body-too-large'],
    ['JSON', { ...systemStats(), body: encoder.encode('{') }, 'json-invalid'],
    ['root schema', systemStats([]), 'schema-invalid'],
    ['system schema', systemStats({ system: [], devices: [] }), 'schema-invalid'],
    ['version schema', systemStats({ system: { comfyui_version: '' }, devices: [] }), 'schema-invalid'],
    ['devices schema', systemStats({ system: { comfyui_version: 'ok' }, devices: Array.from({ length: 65 }, () => ({})) }), 'schema-invalid'],
  ])('rejects invalid /system_stats %s response', async (_case, response, reason) => {
    const host = createComfyUiManagementHost({ httpTransport: { request: async () => response } });
    await expectCode(host.validateApi(connection), 'API_INVALID_RESPONSE', reason);
  });

  it('maps network failure to API_UNREACHABLE and never creates Bridge', async () => {
    let resolverCalls = 0;
    const host = createComfyUiManagementHost({
      httpTransport: { request: async () => { throw new Error('raw-network-detail'); } },
      frontendBridgeResolver: { resolve: async () => { resolverCalls += 1; return compatibleBridge(); } },
    });

    await expectCode(host.testConnection(connection), 'API_UNREACHABLE', 'request-failed');
    expect(resolverCalls).toBe(0);
  });

  it('short-circuits Bridge after API schema failure', async () => {
    let resolverCalls = 0;
    const host = createComfyUiManagementHost({
      httpTransport: { request: async () => systemStats({ system: {}, devices: [] }) },
      frontendBridgeResolver: { resolve: async () => { resolverCalls += 1; return compatibleBridge(); } },
    });

    await expectCode(host.testConnection(connection), 'API_INVALID_RESPONSE');
    expect(resolverCalls).toBe(0);
  });

  it('stops before API and Bridge when owner signal is already aborted', async () => {
    const owner = new AbortController();
    owner.abort();
    let requests = 0;
    let resolverCalls = 0;
    const host = createComfyUiManagementHost({
      httpTransport: { request: async () => { requests += 1; return systemStats(); } },
      frontendBridgeResolver: { resolve: async () => { resolverCalls += 1; return compatibleBridge(); } },
    });

    await expectCode(host.testConnection(connection, owner.signal), 'ABORTED');
    expect(requests).toBe(0);
    expect(resolverCalls).toBe(0);
  });

  it('does not resolve Bridge when owner aborts during API request', async () => {
    const owner = new AbortController();
    let resolverCalls = 0;
    const host = createComfyUiManagementHost({
      httpTransport: {
        request: async () => {
          owner.abort();
          return systemStats();
        },
      },
      frontendBridgeResolver: { resolve: async () => { resolverCalls += 1; return compatibleBridge(); } },
    });

    await expectCode(host.testConnection(connection, owner.signal), 'ABORTED');
    expect(resolverCalls).toBe(0);
  });

  it('propagates owner signal through Bridge resolve and handshake', async () => {
    const owner = new AbortController();
    let resolveSignal: AbortSignal | undefined;
    let exchangeSignal: AbortSignal | undefined;
    const resolver: ComfyUiFrontendBridgeResolver = {
      resolve: async (_workflowId, signal) => {
        resolveSignal = signal;
        return compatibleBridge((value) => { exchangeSignal = value; });
      },
    };
    const host = createComfyUiManagementHost({ httpTransport: { request: async () => systemStats() } });

    await expect(host.validateBridge(resolver, owner.signal)).resolves.toMatchObject({ status: 'compatible' });
    expect(resolveSignal).toBe(owner.signal);
    expect(exchangeSignal).toBe(owner.signal);
  });

  it.each([
    ['load failure', createComfyUiFrontendBridgeResolutionError('load', 'load-failed'), 'WEBVIEW_LOAD_FAILED', 'load-failed'],
    ['ready timeout', createComfyUiFrontendBridgeResolutionError('ready', 'timeout'), 'WEBVIEW_LOAD_FAILED', 'ready-timeout'],
    ['resolver abort', createComfyUiFrontendBridgeResolutionError('load', 'aborted'), 'ABORTED', 'aborted'],
  ] as const)('maps structured resolver %s', async (_case, error, code, reason) => {
    const host = createComfyUiManagementHost({ httpTransport: { request: async () => systemStats() } });
    await expectCode(host.validateBridge({ resolve: async () => { throw error; } }), code, reason);
  });

  it('maps handshake timeout separately from contract mismatch', async () => {
    const host = createComfyUiManagementHost({ httpTransport: { request: async () => systemStats() } });
    await expectCode(host.validateBridge({
      resolve: async () => ({
        identity,
        exchange: async () => { throw createComfyUiFrontendBridgeResolutionError('handshake', 'timeout'); },
      }),
    }), 'BRIDGE_HANDSHAKE_TIMEOUT', 'handshake-timeout');
    await expectCode(host.validateBridge({
      resolve: async () => ({ identity, exchange: async (request) => ({ requestId: request.requestId, ok: true, payload: {} }) }),
    }), 'BRIDGE_CONTRACT_MISMATCH', 'contract-invalid');
  });

  it.each([
    ['identity', { identity: { ...identity, loadId: 'other' } }],
    ['protocol', { protocolVersion: 2 }],
    ['capability', { capabilities: { nativeQueue: true, workflowDiscovery: false, receiptObserver: true } }],
    ['limits', { limits: { ...COMFYUI_BRIDGE_LIMITS, maxMessageBytes: 1 } }],
  ])('rejects Bridge %s contract mismatch', async (_case, override) => {
    const host = createComfyUiManagementHost({ httpTransport: { request: async () => systemStats() } });
    await expectCode(host.validateBridge({
      resolve: async () => ({
        identity,
        exchange: async (request) => ({
          requestId: request.requestId,
          ok: true,
          payload: {
            identity,
            protocolVersion: 1,
            bridgeVersion: '1.0.0',
            frontendVersion: '1.45.20',
            coreVersion: '0.27.1',
            capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true },
            limits: COMFYUI_BRIDGE_LIMITS,
            ...override,
          },
        }),
      }),
    }), 'BRIDGE_CONTRACT_MISMATCH', 'contract-invalid');
  });

  it('maps unknown failures from current phase without parsing error text', async () => {
    const host = createComfyUiManagementHost({ httpTransport: { request: async () => systemStats() } });
    await expectCode(host.validateBridge({ resolve: async () => { throw new Error('handshake timeout'); } }), 'WEBVIEW_LOAD_FAILED', 'unknown');
    await expectCode(host.validateBridge({
      resolve: async () => ({ identity, exchange: async () => { throw new Error('load failed'); } }),
    }), 'BRIDGE_HANDSHAKE_TIMEOUT', 'unknown');
  });

  it('uses configured resolver and owner signal for workflow discovery', async () => {
    const owner = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];
    const workflowIds: string[] = [];
    const host = createComfyUiManagementHost({
      httpTransport: { request: async () => systemStats() },
      frontendBridgeResolver: {
        resolve: async (workflowId, signal) => {
          workflowIds.push(workflowId);
          signals.push(signal);
          return compatibleBridge((value) => signals.push(value));
        },
      },
    });

    await expect(host.discoverFrontendWorkflows(connection, owner.signal)).resolves.toHaveLength(1);
    expect(workflowIds).toEqual(['discovery']);
    expect(signals).toEqual([owner.signal, owner.signal, owner.signal]);
  });

  it('passes dispatch signal to frontend driver resolver', async () => {
    const owner = new AbortController();
    let observedSignal: AbortSignal | undefined;
    await expect(executeComfyUiFrontendQueue(
      {
        connection: { ...connection, targetAffinity: { baseUrl: connection.baseUrl, token: 'attempt-a' } },
        source: { kind: 'frontend-workflow', workflowId: 'wf', revision: 'r1', remotePath: 'wf.json' },
        images: [],
      },
      { imageValues: [] },
      {
        bridgeResolver: { matchesAffinity: () => true, resolve: async (_workflowId, signal) => { observedSignal = signal; return undefined; } },
        transport: { request: async () => systemStats() },
        sink: { put: async () => ({ kind: 'inline', ref: 'unused' }) },
      },
      owner.signal,
    )).rejects.toMatchObject({ details: { code: 'bridge-incompatible' } });
    expect(observedSignal).toBe(owner.signal);
  });
});

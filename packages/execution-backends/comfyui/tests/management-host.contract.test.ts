import { describe, expect, it, vi } from 'vitest';
import {
  COMFYUI_BRIDGE_COMPATIBILITY,
  COMFYUI_BRIDGE_LIMITS,
  createComfyUiManagementHost,
  type ComfyUiBridgeRequest,
  type ComfyUiFrontendBridgePort,
  type ComfyUiHttpResponse,
} from '../src/index.js';
import { contract } from './harness.js';

const connection = {
  connectionId: 'connection-1',
  origin: 'https://comfy.example',
  requestTimeoutMs: 5_000,
} as const;

function jsonResponse(value: unknown, status = 200): ComfyUiHttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: new TextEncoder().encode(JSON.stringify(value)),
  };
}

function statusPayload() {
  return {
    ok: true,
    identity: 'comfyui-imagen-bridge',
    ...COMFYUI_BRIDGE_COMPATIBILITY,
    capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true },
    limits: { ...COMFYUI_BRIDGE_LIMITS },
    detected: {
      frontendVersion: COMFYUI_BRIDGE_COMPATIBILITY.frontendVersion,
      coreVersion: COMFYUI_BRIDGE_COMPATIBILITY.coreVersion,
    },
    compatible: true,
  };
}

function compatibleHandshake(request: ComfyUiBridgeRequest, bridge: ComfyUiFrontendBridgePort) {
  return {
    requestId: request.requestId,
    ok: true,
    payload: {
      identity: { ...bridge.identity },
      ...COMFYUI_BRIDGE_COMPATIBILITY,
      capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true },
      limits: { ...COMFYUI_BRIDGE_LIMITS },
    },
  };
}

function bridgePort(
  onList: (request: ComfyUiBridgeRequest) => unknown = (request) => ({
    requestId: request.requestId,
    ok: true,
    payload: {
      workflows: [{ remotePath: 'nested/workflow.json', contractSummary: contract }],
    },
  }),
) {
  const calls: ComfyUiBridgeRequest[] = [];
  const bridge: ComfyUiFrontendBridgePort = {
    identity: {
      origin: 'com.imagen-ps.panel',
      sourceId: 'host-source',
      loadId: 'load-1',
    },
    async exchange(request) {
      calls.push(request);
      return request.command === 'handshake'
        ? compatibleHandshake(request, bridge)
        : onList(request);
    },
  };
  return { bridge, calls };
}

describe('ComfyUI management host contract', () => {
  it('probes the bounded status endpoint and returns exact Bridge evidence', async () => {
    const httpCalls: unknown[] = [];
    const bridge = bridgePort();
    const host = createComfyUiManagementHost({
      httpTransport: {
        async request(request) {
          httpCalls.push(request);
          return jsonResponse(statusPayload());
        },
      },
      frontendBridgeResolver: {
        async resolve(connectionId) {
          expect(connectionId).toBe(connection.connectionId);
          return bridge.bridge;
        },
      },
    });

    await expect(host.testConnection(connection)).resolves.toEqual({
      api: 'ready',
      bridge: {
        status: 'compatible',
        protocolVersion: COMFYUI_BRIDGE_COMPATIBILITY.protocolVersion,
        bridgeVersion: COMFYUI_BRIDGE_COMPATIBILITY.bridgeVersion,
        frontendVersion: COMFYUI_BRIDGE_COMPATIBILITY.frontendVersion,
        coreVersion: COMFYUI_BRIDGE_COMPATIBILITY.coreVersion,
        contractSchemaVersion: COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaVersion,
        contractSchemaSha256: COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaSha256,
        nativeQueue: true,
      },
    });
    expect(httpCalls).toEqual([{
      origin: connection.origin,
      method: 'GET',
      path: '/imagen-ps/bridge/status',
      timeoutMs: connection.requestTimeoutMs,
      maxResponseBytes: 8_192,
    }]);
    expect(bridge.calls.map((call) => call.command)).toEqual(['handshake']);
  });

  it('keeps API and Bridge availability independent and fails invalid handshakes closed', async () => {
    const unavailable = createComfyUiManagementHost({
      httpTransport: {
        async request() {
          return jsonResponse({ ok: false }, 503);
        },
      },
    });
    await expect(unavailable.testConnection(connection)).resolves.toEqual({
      api: 'unavailable',
      bridge: { status: 'unavailable' },
    });

    const bridge = bridgePort();
    bridge.bridge.exchange = vi.fn(async (request: ComfyUiBridgeRequest) => {
      const response = compatibleHandshake(request, bridge.bridge);
      response.payload.frontendVersion = '0.0.0';
      return response;
    });
    const incompatible = createComfyUiManagementHost({
      httpTransport: { async request() { return jsonResponse(statusPayload()); } },
      frontendBridgeResolver: { async resolve() { return bridge.bridge; } },
    });
    await expect(incompatible.testConnection(connection)).resolves.toEqual({
      api: 'ready',
      bridge: { status: 'incompatible' },
    });
  });

  it('handshakes before listing and returns only canonical path/contract summaries', async () => {
    const bridge = bridgePort();
    const host = createComfyUiManagementHost({
      httpTransport: { async request() { return jsonResponse(statusPayload()); } },
      frontendBridgeResolver: { async resolve() { return bridge.bridge; } },
    });

    const workflows = await host.discoverFrontendWorkflows(connection);
    expect(workflows).toEqual([{
      remotePath: 'nested/workflow.json',
      contract,
    }]);
    expect(Object.isFrozen(workflows)).toBe(true);
    expect(bridge.calls.map((call) => call.command)).toEqual(['handshake', 'list-workflows']);
    expect(bridge.calls[1]?.payload).toEqual({});
  });

  it('fails discovery closed without a resolver or on unsafe response fields', async () => {
    const withoutBridge = createComfyUiManagementHost({
      httpTransport: { async request() { return jsonResponse(statusPayload()); } },
    });
    await expect(withoutBridge.discoverFrontendWorkflows(connection)).rejects.toMatchObject({
      details: { stage: 'prepare', code: 'bridge-incompatible' },
    });

    const unsafe = bridgePort((request) => ({
      requestId: request.requestId,
      ok: true,
      payload: {
        workflows: [{ remotePath: '../secret.json', contractSummary: contract, graph: {} }],
      },
    }));
    const host = createComfyUiManagementHost({
      httpTransport: { async request() { return jsonResponse(statusPayload()); } },
      frontendBridgeResolver: { async resolve() { return unsafe.bridge; } },
    });
    await expect(host.discoverFrontendWorkflows(connection)).rejects.toMatchObject({
      details: { stage: 'prepare', code: 'bridge-incompatible' },
    });
  });
});

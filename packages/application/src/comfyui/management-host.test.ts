import {
  COMFYUI_BRIDGE_COMPATIBILITY,
  COMFYUI_BRIDGE_LIMITS,
  type ComfyUiBridgeRequest,
  type ComfyUiFrontendBridgePort,
  type ComfyUiHttpResponse,
  type ComfyUiWorkflowContract,
} from '@imagen-ps/execution-backend-comfyui';
import { describe, expect, it } from 'vitest';
import { createComfyUiManagementHostPorts } from './management-host.js';
import type { ComfyUiConnection } from './types.js';

const contract = Object.freeze({
  schemaVersion: 1,
  operation: 'text-to-image',
  entries: Object.freeze([{
    role: 'prompt',
    slot: 0,
    required: true,
    dataType: 'text',
    locator: Object.freeze({ nodeId: 'prompt', fieldName: 'text' }),
  }, {
    role: 'output-image',
    slot: 0,
    required: true,
    dataType: 'image',
    locator: Object.freeze({ nodeId: 'output', fieldName: 'images' }),
  }]),
}) as unknown as ComfyUiWorkflowContract;

const connection: ComfyUiConnection = {
  connectionId: 'connection-a',
  displayName: 'Studio ComfyUI',
  origin: 'https://comfy.example',
  requestTimeoutMs: 5_000,
  configureTimeoutMs: 5_000,
  observationTimeoutMs: 5_000,
};

function jsonResponse(value: unknown): ComfyUiHttpResponse {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
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

describe('Application ComfyUI management host ports', () => {
  it('only maps execution evidence and summaries into Application contracts', async () => {
    const bridgeCalls: ComfyUiBridgeRequest[] = [];
    const bridge: ComfyUiFrontendBridgePort = {
      identity: {
        origin: 'com.imagen-ps.panel',
        sourceId: 'uxp-source',
        loadId: 'load-1',
      },
      async exchange(request) {
        bridgeCalls.push(request);
        if (request.command === 'handshake') {
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
        return {
          requestId: request.requestId,
          ok: true,
          payload: {
            workflows: [{ remotePath: 'nested/workflow.json', contractSummary: contract }],
          },
        };
      },
    };
    const ports = createComfyUiManagementHostPorts({
      httpTransport: { async request() { return jsonResponse(statusPayload()); } },
      frontendBridgeResolver: { async resolve() { return bridge; } },
      now: () => new Date('2026-07-19T00:00:00.000Z'),
    });

    await expect(ports.tester.test(connection)).resolves.toEqual({
      checkedAt: '2026-07-19T00:00:00.000Z',
      api: 'ready',
      bridge: {
        status: 'compatible',
        protocolVersion: COMFYUI_BRIDGE_COMPATIBILITY.protocolVersion,
        bridgeVersion: COMFYUI_BRIDGE_COMPATIBILITY.bridgeVersion,
        frontendVersion: COMFYUI_BRIDGE_COMPATIBILITY.frontendVersion,
        coreVersion: COMFYUI_BRIDGE_COMPATIBILITY.coreVersion,
        contractSchemaVersion: COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaVersion,
        contractSchemaDigest: COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaSha256,
        nativeQueue: true,
      },
    });
    await expect(ports.discovery.list(connection)).resolves.toEqual([{
      displayName: 'nested/workflow.json',
      remotePath: 'nested/workflow.json',
      contract,
    }]);
    expect(bridgeCalls.map((call) => call.command)).toEqual([
      'handshake',
      'handshake',
      'list-workflows',
    ]);
  });
});

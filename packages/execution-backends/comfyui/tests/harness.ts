import type { StoredAssetRef } from '@imagen-ps/core-engine';
import {
  COMFYUI_BRIDGE_COMPATIBILITY,
  COMFYUI_BRIDGE_LIMITS,
  IMAGEN_WORKFLOW_BINDING_CLASS_ID,
  IMAGEN_WORKFLOW_TYPE_CLASS_ID,
  admitComfyUiApiGraph,
  createComfyUiExecutionAdapter,
  parseComfyUiWorkflowContract,
  type ComfyUiBridgeRequest,
  type ComfyUiExecutionRequest,
  type ComfyUiFrontendBridgePort,
  type ComfyUiHttpRequest,
  type ComfyUiHttpResponse,
} from '../src/index.js';

export const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export const bindingDocument = {
  schemaVersion: 1,
  bindings: [
    { role: 'prompt', slot: 0, locator: { nodeId: 'prompt', fieldName: 'text' } },
    { role: 'image', slot: 0, locator: { nodeId: 'image', fieldName: 'image' } },
    { role: 'mask', slot: 0, locator: { nodeId: 'mask', fieldName: 'image' } },
    { role: 'output-image', slot: 0, locator: { nodeId: 'save', fieldName: 'images' } },
  ],
} as const;

export const typeDocument = {
  schemaVersion: 1,
  operation: 'image-edit',
  entries: [
    { role: 'prompt', slot: 0, required: true, dataType: 'text' },
    { role: 'image', slot: 0, required: true, dataType: 'image' },
    { role: 'mask', slot: 0, required: false, dataType: 'mask', maskEncoding: 'inverted-alpha' },
    { role: 'output-image', slot: 0, required: true, dataType: 'image' },
  ],
} as const;

export const contract = parseComfyUiWorkflowContract(bindingDocument, typeDocument);

export const apiGraph = admitComfyUiApiGraph({
  bindingContract: {
    class_type: IMAGEN_WORKFLOW_BINDING_CLASS_ID,
    inputs: { contract: bindingDocument },
  },
  typeContract: {
    class_type: IMAGEN_WORKFLOW_TYPE_CLASS_ID,
    inputs: { contract: typeDocument },
  },
  prompt: { class_type: 'Text', inputs: { text: 'default prompt' } },
  image: { class_type: 'LoadImage', inputs: { image: 'default-image.png' } },
  mask: { class_type: 'LoadImage', inputs: { image: 'default-mask.png' } },
  save: { class_type: 'SaveImage', inputs: { images: '' } },
});

function jsonResponse(value: unknown, status = 200): ComfyUiHttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: new TextEncoder().encode(JSON.stringify(value)),
  };
}

export interface TestHarnessOptions {
  readonly source?: 'api-graph' | 'frontend-workflow';
  readonly includeMask?: boolean;
  readonly onRequest?: (
    request: ComfyUiHttpRequest,
    callIndex: number,
  ) => Promise<ComfyUiHttpResponse | undefined> | ComfyUiHttpResponse | undefined;
  readonly onBridgeExchange?: (
    request: ComfyUiBridgeRequest,
    callIndex: number,
    bridge: ComfyUiFrontendBridgePort,
  ) => Promise<unknown> | unknown;
  readonly resolveAsset?: (ref: StoredAssetRef, signal?: AbortSignal) => Promise<{
    readonly bytes: Uint8Array;
    readonly mimeType: string;
  } | undefined>;
  readonly sinkPut?: (bytes: Uint8Array, mimeType: string) => Promise<StoredAssetRef>;
}

export function createTestHarness(options: TestHarnessOptions = {}) {
  const httpCalls: ComfyUiHttpRequest[] = [];
  const bridgeCalls: ComfyUiBridgeRequest[] = [];
  const sinkCalls: Uint8Array[] = [];
  let uploadIndex = 0;
  let runtimeIdIndex = 0;
  let now = 1_000;
  const promptId = options.source === 'frontend-workflow' ? 'frontend-prompt' : 'api-prompt';
  const transport = {
    async request(request: ComfyUiHttpRequest): Promise<ComfyUiHttpResponse> {
      httpCalls.push(request);
      const override = await options.onRequest?.(request, httpCalls.length);
      if (override !== undefined) return override;
      if (request.path === '/upload/image') {
        uploadIndex += 1;
        return jsonResponse({ name: `remote-${uploadIndex}.png`, subfolder: '', type: 'input' });
      }
      if (request.path === '/prompt') return jsonResponse({ prompt_id: promptId, client_id: 'comfy-client-1' });
      if (request.path === `/history/${promptId}`) {
        return jsonResponse({
          [promptId]: {
            status: { completed: true, status_str: 'success' },
            outputs: {
              save: {
                images: [{ filename: 'result.png', subfolder: '', type: 'output' }],
              },
            },
          },
        });
      }
      if (request.path === '/queue') return jsonResponse({ queue_running: [], queue_pending: [] });
      if (request.path.startsWith('/view?')) {
        return { status: 200, headers: { 'content-type': 'image/png' }, body: pngBytes.slice() };
      }
      throw new Error('unexpected fake HTTP request');
    },
  };

  const bridge: ComfyUiFrontendBridgePort = {
    identity: {
      origin: 'com.imagen-ps.panel',
      sourceId: 'iframe-source',
      loadId: 'load-1',
    },
    async exchange(request): Promise<unknown> {
      bridgeCalls.push(request);
      if (options.onBridgeExchange !== undefined) {
        return options.onBridgeExchange(request, bridgeCalls.length, bridge);
      }
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
      if (request.command === 'submit-workflow') {
        return {
          requestId: request.requestId,
          ok: true,
          payload: {
            operationId: request.payload.operationId,
            promptId,
            acknowledgedAt: now,
          },
        };
      }
      throw new Error('unexpected fake Bridge request');
    },
  };

  const adapter = createComfyUiExecutionAdapter({
    assetResolver: {
      async resolve(ref, signal) {
        return options.resolveAsset?.(ref, signal) ?? {
          bytes: pngBytes.slice(),
          mimeType: 'image/png',
        };
      },
    },
    assetSink: {
      async put(bytes, meta) {
        sinkCalls.push(bytes.slice());
        return options.sinkPut?.(bytes, meta.mimeType) ?? {
          kind: 'inline',
          ref: `output-${sinkCalls.length}`,
          mimeType: meta.mimeType,
          byteSize: bytes.byteLength,
        };
      },
    },
    httpTransport: transport,
    maskEncoder: {
      async encode(asset) {
        return { ...asset, bytes: asset.bytes.slice() };
      },
    },
    frontendBridgeResolver: {
      async resolve() {
        return bridge;
      },
    },
    promptHintSourceFactory: {
      async open() {
        return {
          async waitForHint() {},
          dispose() {},
        };
      },
    },
    clock: {
      now: () => now,
      async sleep(ms) {
        now += ms;
      },
    },
    createRuntimeId(prefix) {
      runtimeIdIndex += 1;
      return `${prefix}-${runtimeIdIndex}`;
    },
  });

  const imageRef: StoredAssetRef = {
    kind: 'inline',
    ref: 'image-input',
    mimeType: 'image/png',
    byteSize: pngBytes.byteLength,
  };
  const maskRef: StoredAssetRef = {
    kind: 'inline',
    ref: 'mask-input',
    mimeType: 'image/png',
    byteSize: pngBytes.byteLength,
  };
  const source = options.source === 'frontend-workflow'
    ? { kind: 'frontend-workflow' as const, workflowId: 'workflow-1', remotePath: 'workflows/d01.json' }
    : { kind: 'api-graph' as const, workflowId: 'workflow-1', graph: apiGraph };
  const request: ComfyUiExecutionRequest = {
    connection: {
      connectionId: 'connection-1',
      origin: 'https://comfy.example',
      requestTimeoutMs: 5_000,
      observationTimeoutMs: 5_000,
    },
    source,
    contract,
    prompt: 'make a portrait',
    images: [{ storedRef: imageRef, width: 1024, height: 1024 }],
    ...(options.includeMask === false
      ? {}
      : { mask: { storedRef: maskRef, width: 1024, height: 1024 } }),
  };

  return {
    adapter,
    request,
    httpCalls,
    bridgeCalls,
    sinkCalls,
    bridge,
    jsonResponse,
  };
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createComfyUiWorkflowDraftStore,
  createComfyUiWorkflowRuntimeCache,
  createInMemoryComfyUiStateRepository,
} from '@imagen-ps/application';
import { createComfyUiAppRuntime } from '../../../src/adapters/comfyui/comfyui-app-runtime';

const identity = { origin: 'https://comfy.example.test', sourceId: 'source', loadId: 'load' };
const bridgeLimits = {
  maxMessageBytes: 2_000_000,
  maxWorkflowPathBytes: 512,
  maxWorkflowListEntries: 1_000,
  maxMutations: 16,
  maxIdChars: 128,
  maxConfigureTimeoutMs: 30_000,
};

describe('ComfyUI app runtime', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('opens the selected Workflow through the host ExternalUrlPort', async () => {
    const open = vi.fn(async () => undefined);
    const runtime = createComfyUiAppRuntime({
      repositories: {
        state: createInMemoryComfyUiStateRepository({
          baseUrl: 'https://comfy.example.test/reverse-proxy',
          selectedWorkflowId: null,
          ambiguousMappingsByRevision: {},
        }),
        cache: createComfyUiWorkflowRuntimeCache(),
        drafts: createComfyUiWorkflowDraftStore(),
      },
      httpTransport: { request: async () => ({ status: 200, headers: {}, body: new Uint8Array() }) },
      frontendBridgeResolver: {
        resolve: async () => ({
          identity,
          exchange: async (request) => {
            if (request.command === 'handshake') {
              return {
                requestId: request.requestId,
                ok: true,
                payload: {
                  identity,
                  protocolVersion: 1,
                  bridgeVersion: 'test',
                  frontendVersion: 'test',
                  coreVersion: 'test',
                  capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true },
                  limits: bridgeLimits,
                },
              };
            }
            if (request.command === 'list-workflows') {
              return {
                requestId: request.requestId,
                ok: true,
                payload: { workflows: [{ workflowId: 'workflow-id', nativeWorkflowId: 'native-workflow-id', displayName: 'Workflow', remotePath: 'workflow.json', revision: 'r1' }] },
              };
            }
            if (request.command === 'open-workflow') {
              return { requestId: request.requestId, ok: true, payload: { opened: true } };
            }
            return { requestId: request.requestId, ok: true, payload: { values: { nodes: [] } } };
          },
        }),
      },
      externalUrl: { open },
    });
    dispose = runtime.dispose;

    await runtime.management.discover();
    await runtime.management.selectWorkflow('workflow-id');
    await runtime.management.openInComfyUi();

    expect(open).toHaveBeenCalledWith(
      'https://comfy.example.test/reverse-proxy#native-workflow-id',
      'Open workflow in ComfyUI',
    );
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  comfyUiExecutionInput,
  createApplicationComfyUiExecutionAdapter,
  createComfyUiWorkflowDraftStore,
  createComfyUiWorkflowRuntimeCache,
  createInMemoryComfyUiStateRepository,
  type ComfyUiConnectionTarget,
  type ComfyUiFrontendBridgeGeneration,
  type ComfyUiFrontendBridgeGenerationFactory,
} from '@imagen-ps/application';
import { createComfyUiAppRuntime } from '../../../src/adapters/comfyui/comfyui-app-runtime';

const bridgeLimits = {
  maxMessageBytes: 2_000_000,
  maxWorkflowPathBytes: 512,
  maxWorkflowListEntries: 1_000,
  maxMutations: 16,
  maxIdChars: 128,
  maxConfigureTimeoutMs: 30_000,
};

class RecordingGenerationFactory implements ComfyUiFrontendBridgeGenerationFactory {
  readonly generations: Array<ComfyUiFrontendBridgeGeneration & {
    readonly resolveCalls: string[];
    readonly commands: string[];
    retired: boolean;
    disposed: boolean;
  }> = [];

  create(target: ComfyUiConnectionTarget) {
    const index = this.generations.length + 1;
    const identity = { origin: 'com.imagen-ps.panel', sourceId: `source-${index}`, loadId: `load-${index}` };
    const generation = {
      target,
      resolveCalls: [] as string[],
      commands: [] as string[],
      retired: false,
      disposed: false,
      async resolve(workflowId: string) {
        generation.resolveCalls.push(workflowId);
        if (generation.disposed || generation.retired) return undefined;
        return {
          identity,
          async exchange(request: { readonly requestId: string; readonly command: string }) {
            generation.commands.push(request.command);
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
                payload: {
                  workflows: [{
                    workflowId: 'workflow-id',
                    nativeWorkflowId: 'native-workflow-id',
                    displayName: 'Workflow',
                    remotePath: 'workflow.json',
                    revision: 'r1',
                  }],
                },
              };
            }
            if (request.command === 'open-workflow') {
              return { requestId: request.requestId, ok: true, payload: { opened: true } };
            }
            return { requestId: request.requestId, ok: true, payload: { values: { nodes: [] } } };
          },
        };
      },
      retire() {
        if (generation.retired || generation.disposed) return;
        generation.retired = true;
        generation.disposed = true;
      },
      dispose() { generation.disposed = true; },
    } satisfies ComfyUiFrontendBridgeGeneration & {
      readonly resolveCalls: string[];
      readonly commands: string[];
      retired: boolean;
      disposed: boolean;
    };
    this.generations.push(generation);
    return generation;
  }
}

function apiTransport() {
  const body = new TextEncoder().encode(JSON.stringify({
    system: { comfyui_version: '0.3.0' },
    devices: [],
  }));
  return {
    request: vi.fn(async () => ({ status: 200, headers: {}, body })),
  };
}

function repositories(baseUrl = 'https://comfy.example.test/reverse-proxy') {
  return {
    state: createInMemoryComfyUiStateRepository({
      baseUrl,
      selectedWorkflowId: null,
      ambiguousMappingsByRevision: {},
    }),
    cache: createComfyUiWorkflowRuntimeCache(),
    drafts: createComfyUiWorkflowDraftStore(),
  };
}

describe('ComfyUI app runtime', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('recovers committed target and routes discovery/load through active generation', async () => {
    const open = vi.fn(async () => undefined);
    const generationFactory = new RecordingGenerationFactory();
    const runtime = createComfyUiAppRuntime({
      repositories: repositories(),
      httpTransport: apiTransport(),
      generationFactory,
      externalUrl: { open },
    });
    dispose = runtime.dispose;

    await runtime.management.loadState();
    const discovered = await runtime.management.discover();
    await runtime.management.selectWorkflow('workflow-id');
    await runtime.management.openInComfyUi();

    expect(discovered).toHaveLength(1);
    expect(generationFactory.generations).toHaveLength(1);
    expect(generationFactory.generations[0]?.target.baseUrl).toBe('https://comfy.example.test/reverse-proxy');
    expect(generationFactory.generations[0]?.resolveCalls).toEqual(expect.arrayContaining([
      'discovery', 'workflow-id',
    ]));
    expect(generationFactory.generations[0]?.commands).toEqual(expect.arrayContaining([
      'handshake', 'list-workflows', 'open-workflow', 'form-values',
    ]));
    expect(open).toHaveBeenCalledWith(
      'https://comfy.example.test/reverse-proxy#native-workflow-id',
      'Open workflow in ComfyUI',
    );
  });

  it('validates through execution host, promotes B, retires A, and disposes coordinator first', async () => {
    const generationFactory = new RecordingGenerationFactory();
    const transport = apiTransport();
    const runtime = createComfyUiAppRuntime({
      repositories: repositories('https://a.example.test/proxy'),
      httpTransport: transport,
      generationFactory,
      externalUrl: { open: async () => undefined },
    });
    dispose = runtime.dispose;

    await runtime.management.loadState();
    const first = generationFactory.generations[0]!;
    const result = await runtime.management.connect('https://b.example.test/proxy');

    expect(result).toMatchObject({ ok: true, target: { baseUrl: 'https://b.example.test/proxy' } });
    expect(transport.request).toHaveBeenCalledTimes(2);
    expect(generationFactory.generations).toHaveLength(2);
    expect(first.retired).toBe(true);
    const second = generationFactory.generations[1]!;
    expect(second.commands).toContain('handshake');

    await runtime.management.discover();
    expect(second.resolveCalls.at(-1)).toBe('discovery');
    runtime.dispose();
    dispose = undefined;
    expect(second.disposed).toBe(true);
    runtime.dispose();
  });

  it('rejects admitted A execution after B promotion without routing Bridge work to B', async () => {
    const generationFactory = new RecordingGenerationFactory();
    const runtime = createComfyUiAppRuntime({
      repositories: repositories('https://a.example.test/proxy'),
      httpTransport: apiTransport(),
      generationFactory,
      externalUrl: { open: async () => undefined },
    });
    dispose = runtime.dispose;

    await runtime.management.loadState();
    await runtime.management.discover();
    const backend = runtime.generationBackends.find((item) => item.id === 'comfyui')!;
    const runningTask = {
      schemaVersion: 3 as const,
      taskId: 'target-affinity-task',
      status: 'running' as const,
      operation: 'text-to-image' as const,
      prompt: '',
      attachments: [],
      outputs: [],
      placement: { kind: 'unbound' as const, reason: 'no-photoshop-source' as const },
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z',
    };
    const admitted = await backend.admit({
      taskId: runningTask.taskId,
      backendId: 'comfyui',
      payload: { workflowId: 'workflow-id', runningTask },
    });
    const request = comfyUiExecutionInput(admitted) as unknown as {
      readonly connection: { readonly baseUrl: string; readonly targetAffinity: { readonly baseUrl: string; readonly token: string } };
    };
    expect(request.connection).toMatchObject({
      baseUrl: 'https://a.example.test/proxy',
      targetAffinity: { baseUrl: 'https://a.example.test/proxy', token: '1' },
    });

    await runtime.management.connect('https://b.example.test/proxy');
    const first = generationFactory.generations[0]!;
    const second = generationFactory.generations[1]!;
    const aResolveCalls = [...first.resolveCalls];
    const aCommands = [...first.commands];
    const bResolveCalls = [...second.resolveCalls];
    const bCommands = [...second.commands];
    const adapter = createApplicationComfyUiExecutionAdapter(() => ({
      resolve: async () => undefined,
      put: async () => ({ kind: 'inline', ref: 'unused' }),
    } as never));

    await expect(adapter.dispatch(admitted.execution.input)).rejects.toMatchObject({
      details: { stage: 'prepare', code: 'invalid-connection', remoteMayContinue: false },
    });
    expect(first.resolveCalls).toEqual(aResolveCalls);
    expect(first.commands).toEqual(aCommands);
    expect(second.resolveCalls).toEqual(bResolveCalls);
    expect(second.commands).toEqual(bCommands);
    expect(second.commands).not.toContain('submit');
  });
});

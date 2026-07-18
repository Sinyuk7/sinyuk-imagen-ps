import {
  type ComfyUiConnection,
  type ComfyUiWorkflowConfig,
} from '@imagen-ps/application';
import { describe, expect, it } from 'vitest';
import { createUxpComfyUiRepositories } from '../../../src/adapters/uxp/uxp-comfyui-persistence';
import type { UxpModules } from '../../../src/adapters/uxp/uxp-api';

const connectionA: ComfyUiConnection = {
  connectionId: 'connection-a',
  displayName: 'Studio A',
  origin: 'https://comfy-a.example.test',
  requestTimeoutMs: 30_000,
  configureTimeoutMs: 30_000,
  observationTimeoutMs: 300_000,
  lastTest: {
    checkedAt: '2026-07-18T00:00:00.000Z',
    api: 'ready',
    bridge: {
      status: 'compatible',
      protocolVersion: 1,
      bridgeVersion: '1.0.0',
      frontendVersion: '1.45.20',
      coreVersion: '0.27.1',
      contractSchemaVersion: 1,
      contractSchemaDigest: 'a'.repeat(64),
      nativeQueue: true,
    },
  },
};

const connectionB: ComfyUiConnection = {
  connectionId: 'connection-b',
  displayName: 'Studio B',
  origin: 'http://127.0.0.1:8188',
  requestTimeoutMs: 30_000,
  configureTimeoutMs: 30_000,
  observationTimeoutMs: 300_000,
};

const contract = {
  schemaVersion: 1,
  operation: 'text-to-image',
  entries: [{
    role: 'prompt',
    slot: 0,
    required: true,
    dataType: 'text',
    locator: { nodeId: 'prompt', fieldName: 'text' },
  }, {
    role: 'output-image',
    slot: 0,
    required: true,
    dataType: 'image',
    locator: { nodeId: 'output', fieldName: 'images' },
  }],
} as const;

function workflow(workflowId: string, connectionId: string): ComfyUiWorkflowConfig {
  return {
    workflowId,
    displayName: workflowId,
    connectionId,
    source: { kind: 'frontend-workflow', remotePath: `${workflowId}.json` },
    contract,
  } as unknown as ComfyUiWorkflowConfig;
}

function createMemoryUxpModules(initial?: Record<string, string>): {
  readonly modules: UxpModules;
  readonly files: Map<string, string>;
} {
  const files = new Map(Object.entries(initial ?? {}));

  function fileFor(name: string) {
    return {
      async read() {
        return files.get(name) ?? '';
      },
      async write(value: string | ArrayBuffer) {
        if (typeof value !== 'string') {
          throw new Error('Expected JSON text.');
        }
        files.set(name, value);
      },
    };
  }

  return {
    files,
    modules: {
      uxp: {
        storage: {
          formats: { utf8: 'utf8' },
          localFileSystem: {
            async getDataFolder() {
              return {
                async getEntry(name: string) {
                  if (!files.has(name)) {
                    throw new Error('File not found.');
                  }
                  return fileFor(name);
                },
                async createFile(name: string) {
                  files.set(name, '');
                  return fileFor(name);
                },
              };
            },
          },
        },
      },
    },
  };
}

describe('UXP ComfyUI persistence', () => {
  it('round-trips deterministic current-schema files and preserves Provider selection', async () => {
    const memory = createMemoryUxpModules();
    const repositories = createUxpComfyUiRepositories(memory.modules);
    const workflowB = workflow('workflow-b', connectionB.connectionId);
    const workflowA = workflow('workflow-a', connectionA.connectionId);

    await repositories.connections.save(connectionB);
    await repositories.connections.save(connectionA);
    await repositories.workflows.save(workflowB);
    await repositories.workflows.save(workflowA);
    await repositories.selection.save({ kind: 'provider', profileId: 'profile-a', modelId: 'model-a' });

    await expect(repositories.connections.list()).resolves.toEqual([connectionA, connectionB]);
    await expect(repositories.connections.get(connectionA.connectionId)).resolves.toEqual(connectionA);
    await expect(repositories.workflows.list()).resolves.toEqual([workflowA, workflowB]);
    await expect(repositories.workflows.list(connectionA.connectionId)).resolves.toEqual([workflowA]);
    await expect(repositories.workflows.get(workflowA.workflowId)).resolves.toEqual(workflowA);
    await expect(repositories.selection.get()).resolves.toEqual({
      kind: 'provider',
      profileId: 'profile-a',
      modelId: 'model-a',
    });

    expect(JSON.parse(memory.files.get('comfyui-connections.json') ?? '{}')).toMatchObject({
      schemaVersion: 1,
      records: [connectionA, connectionB],
    });
    expect(JSON.parse(memory.files.get('comfyui-workflows.json') ?? '{}')).toMatchObject({
      schemaVersion: 1,
      records: [workflowA, workflowB],
    });
    expect(JSON.parse(memory.files.get('generation-target-selection.json') ?? '{}')).toEqual({
      schemaVersion: 1,
      selection: { kind: 'provider', profileId: 'profile-a', modelId: 'model-a' },
    });

    const restored = await repositories.workflows.get(workflowA.workflowId);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored?.source)).toBe(true);
    expect(Object.isFrozen(restored?.contract.entries)).toBe(true);
  });

  it('deletes exact records, connection-owned workflows, and current selection', async () => {
    const memory = createMemoryUxpModules();
    const repositories = createUxpComfyUiRepositories(memory.modules);
    const workflowA = workflow('workflow-a', connectionA.connectionId);
    const workflowB = workflow('workflow-b', connectionB.connectionId);

    await repositories.connections.save(connectionA);
    await repositories.connections.save(connectionB);
    await repositories.workflows.save(workflowA);
    await repositories.workflows.save(workflowB);
    await repositories.selection.save({ kind: 'comfyui', workflowId: workflowA.workflowId });

    await repositories.connections.delete(connectionA.connectionId);
    await repositories.workflows.deleteConnection(connectionA.connectionId);
    await repositories.selection.clear();

    await expect(repositories.connections.list()).resolves.toEqual([connectionB]);
    await expect(repositories.workflows.list()).resolves.toEqual([workflowB]);
    await expect(repositories.selection.get()).resolves.toBeUndefined();

    await repositories.workflows.delete(workflowB.workflowId);
    await expect(repositories.workflows.list()).resolves.toEqual([]);
  });

  it('fails closed for malformed JSON, secret-shaped records, and unsupported schemas', async () => {
    const badWorkflow = workflow('workflow-a', connectionA.connectionId);
    const memory = createMemoryUxpModules({
      'comfyui-connections.json': JSON.stringify({
        schemaVersion: 1,
        records: [
          { ...connectionA, secretRefs: { apiKey: 'secret:test' } },
          connectionB,
          connectionB,
        ],
      }),
      'comfyui-workflows.json': JSON.stringify({
        schemaVersion: 0,
        records: [badWorkflow],
      }),
      'generation-target-selection.json': JSON.stringify({
        schemaVersion: 1,
        selection: {
          kind: 'comfyui',
          workflowId: badWorkflow.workflowId,
          connectionId: connectionA.connectionId,
        },
      }),
    });
    const repositories = createUxpComfyUiRepositories(memory.modules);

    await expect(repositories.connections.list()).resolves.toEqual([]);
    await expect(repositories.connections.get(connectionA.connectionId)).resolves.toBeUndefined();
    await expect(repositories.workflows.list()).resolves.toEqual([]);
    await expect(repositories.workflows.get(badWorkflow.workflowId)).resolves.toBeUndefined();
    await expect(repositories.selection.get()).resolves.toBeUndefined();

    memory.files.set('comfyui-connections.json', '{not-json');
    await expect(repositories.connections.list()).resolves.toEqual([]);
  });
});

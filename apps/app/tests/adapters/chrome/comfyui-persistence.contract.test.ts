import {
  type ComfyUiConnection,
  type ComfyUiWorkflowConfig,
} from '@imagen-ps/application';
import { describe, expect, it } from 'vitest';
import { createChromeComfyUiRepositories } from '../../../src/adapters/chrome/chrome-comfyui-persistence';
import { createMemoryIndexedDbBackend } from '../../../src/adapters/chrome/indexed-db-storage';

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

function frontendWorkflow(
  workflowId: string,
  connectionId: string,
): ComfyUiWorkflowConfig {
  return {
    workflowId,
    displayName: workflowId,
    connectionId,
    source: { kind: 'frontend-workflow', remotePath: `${workflowId}.json` },
    contract,
  } as unknown as ComfyUiWorkflowConfig;
}

function apiWorkflow(workflowId: string, connectionId: string): ComfyUiWorkflowConfig {
  return {
    workflowId,
    displayName: workflowId,
    connectionId,
    source: {
      kind: 'api-graph',
      graph: {
        prompt: { class_type: 'CLIPTextEncode', inputs: { text: '' } },
        output: { class_type: 'SaveImage', inputs: { images: ['prompt', 0] } },
      },
    },
    contract,
  } as unknown as ComfyUiWorkflowConfig;
}

describe('Chrome ComfyUI persistence', () => {
  it('round-trips current-schema records deterministically and preserves Provider selection', async () => {
    const backend = createMemoryIndexedDbBackend();
    const repositories = createChromeComfyUiRepositories({ backend });
    const workflowB = frontendWorkflow('workflow-b', connectionB.connectionId);
    const workflowA = apiWorkflow('workflow-a', connectionA.connectionId);

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

    expect(await backend.get('comfyUiConnections', connectionA.connectionId)).toEqual({
      schemaVersion: 1,
      value: connectionA,
    });
    expect(await backend.get('comfyUiWorkflows', workflowA.workflowId)).toEqual({
      schemaVersion: 1,
      value: workflowA,
    });
    expect(await backend.get('generationTargetSelection', 'current')).toEqual({
      schemaVersion: 1,
      value: { kind: 'provider', profileId: 'profile-a', modelId: 'model-a' },
    });

    const restored = await repositories.workflows.get(workflowA.workflowId);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored?.source)).toBe(true);
    expect(Object.isFrozen(restored?.contract.entries)).toBe(true);
  });

  it('deletes exact records, connection-owned workflows, and current selection', async () => {
    const backend = createMemoryIndexedDbBackend();
    const repositories = createChromeComfyUiRepositories({ backend });
    const workflowA = frontendWorkflow('workflow-a', connectionA.connectionId);
    const workflowB = frontendWorkflow('workflow-b', connectionB.connectionId);

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

  it('fails closed for malformed, secret-shaped, and unsupported-schema storage', async () => {
    const workflow = frontendWorkflow('workflow-a', connectionA.connectionId);
    const backend = createMemoryIndexedDbBackend({
      initial: {
        comfyUiConnections: [{
          key: connectionA.connectionId,
          value: { schemaVersion: 1, value: { ...connectionA, secretRefs: { apiKey: 'secret:test' } } },
        }, {
          key: connectionB.connectionId,
          value: { schemaVersion: 0, value: connectionB },
        }, {
          key: 'connection-mismatch',
          value: { schemaVersion: 1, value: connectionA },
        }],
        comfyUiWorkflows: [{
          key: workflow.workflowId,
          value: {
            schemaVersion: 1,
            value: { ...workflow, contract: { ...contract, schemaVersion: 2 } },
          },
        }, {
          key: 'workflow-mismatch',
          value: { schemaVersion: 1, value: workflow },
        }],
        generationTargetSelection: [{
          key: 'current',
          value: {
            schemaVersion: 1,
            value: {
              kind: 'comfyui',
              workflowId: workflow.workflowId,
              connectionId: connectionA.connectionId,
            },
          },
        }],
      },
    });
    const repositories = createChromeComfyUiRepositories({ backend });

    await expect(repositories.connections.list()).resolves.toEqual([]);
    await expect(repositories.connections.get(connectionA.connectionId)).resolves.toBeUndefined();
    await expect(repositories.workflows.list()).resolves.toEqual([]);
    await expect(repositories.workflows.get(workflow.workflowId)).resolves.toBeUndefined();
    await expect(repositories.selection.get()).resolves.toBeUndefined();
  });
});

import {
  COMFYUI_BRIDGE_COMPATIBILITY,
  type ComfyUiWorkflowContract,
} from '@imagen-ps/execution-backend-comfyui';
import { describe, expect, it, vi } from 'vitest';
import { createComfyUiManagementService } from './management.js';
import {
  createInMemoryComfyUiConnectionRepository,
  createInMemoryComfyUiWorkflowRepository,
  createInMemoryGenerationTargetSelectionRepository,
} from './repositories.js';
import type {
  ComfyUiConnectionTestEvidence,
  ComfyUiManagementDependencies,
} from './types.js';

const checkedAt = '2026-07-18T00:00:00.000Z';
const compatibleEvidence = {
  checkedAt,
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
} as const satisfies ComfyUiConnectionTestEvidence;
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
const maskContract = Object.freeze({
  schemaVersion: 1,
  operation: 'image-edit',
  entries: Object.freeze([{
    role: 'prompt',
    slot: 0,
    required: true,
    dataType: 'text',
    locator: Object.freeze({ nodeId: 'prompt', fieldName: 'text' }),
  }, {
    role: 'image',
    slot: 0,
    required: true,
    dataType: 'image',
    locator: Object.freeze({ nodeId: 'image', fieldName: 'image' }),
  }, {
    role: 'mask',
    slot: 0,
    required: false,
    dataType: 'mask',
    maskEncoding: 'grayscale',
    locator: Object.freeze({ nodeId: 'mask', fieldName: 'image' }),
  }, {
    role: 'output-image',
    slot: 0,
    required: true,
    dataType: 'image',
    locator: Object.freeze({ nodeId: 'output', fieldName: 'images' }),
  }]),
}) as unknown as ComfyUiWorkflowContract;

function harness(evidence?: ComfyUiConnectionTestEvidence) {
  const connections = createInMemoryComfyUiConnectionRepository();
  const workflows = createInMemoryComfyUiWorkflowRepository();
  const selection = createInMemoryGenerationTargetSelectionRepository();
  const tester = {
    test: vi.fn(async () => evidence ?? ({ checkedAt, api: 'ready' } as const)),
  };
  const discovery = {
    list: vi.fn(async () => ([{
      displayName: 'Remote workflow',
      remotePath: 'imagen/d01.json',
      contract,
    }])),
  };
  const dependencies: ComfyUiManagementDependencies = {
    connections,
    workflows,
    selection,
    tester,
    discovery,
  };
  return {
    service: createComfyUiManagementService(dependencies),
    connections,
    workflows,
    selection,
    tester,
    discovery,
  };
}

async function saveConnection(service: ReturnType<typeof createComfyUiManagementService>) {
  return service.saveConnection({
    connectionId: 'connection-a',
    displayName: 'Studio ComfyUI',
    origin: 'https://comfy.example.test/',
  });
}

describe('ComfyUI management contract', () => {
  it('canonicalizes safe unauthenticated connections and rejects secret-shaped fields before testing', async () => {
    const { service, tester } = harness();
    await expect(saveConnection(service)).resolves.toMatchObject({
      connectionId: 'connection-a',
      origin: 'https://comfy.example.test',
      requestTimeoutMs: 30_000,
      configureTimeoutMs: 30_000,
      observationTimeoutMs: 300_000,
    });

    await expect(service.saveConnection({
      connectionId: 'connection-b',
      displayName: 'Unsafe',
      origin: 'https://user:password@comfy.example.test',
    })).rejects.toMatchObject({ category: 'validation' });
    await expect(service.saveConnection({
      connectionId: 'connection-b',
      displayName: 'Unsafe',
      origin: 'https://comfy.example.test',
      headers: { Authorization: 'Bearer secret' },
    } as never)).rejects.toMatchObject({ category: 'validation' });
    expect(tester.test).not.toHaveBeenCalled();
  });

  it('round-trips connection test evidence without exposing raw transport state', async () => {
    const evidence = {
      checkedAt,
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
    } as const;
    const { service } = harness(evidence);
    await saveConnection(service);
    await expect(service.testConnection('connection-a')).resolves.toEqual(evidence);
    await expect(service.getConnection('connection-a')).resolves.toMatchObject({ lastTest: evidence });

    await service.saveConnection({
      connectionId: 'connection-a',
      displayName: 'Studio ComfyUI',
      origin: 'https://other.example.test',
    });
    await expect(service.getConnection('connection-a')).resolves.not.toHaveProperty('lastTest');
  });

  it('rejects malformed host test evidence instead of persisting transport-owned fields', async () => {
    const { service, tester } = harness();
    await saveConnection(service);
    tester.test.mockResolvedValueOnce({
      checkedAt,
      api: 'ready',
      rawResponse: { endpoint: 'https://secret.example.test' },
    } as never);
    await expect(service.testConnection('connection-a')).rejects.toMatchObject({ category: 'validation' });
    await expect(service.getConnection('connection-a')).resolves.not.toHaveProperty('lastTest');
  });

  it('keeps Provider selection behavior and clears invalid ComfyUI selection without replacement', async () => {
    const { service, selection } = harness(compatibleEvidence);
    await saveConnection(service);
    await service.testConnection('connection-a');
    await service.saveFrontendWorkflow({
      workflowId: 'workflow-a',
      displayName: 'Workflow A',
      connectionId: 'connection-a',
      remotePath: 'imagen/d01.json',
      contract,
    });
    await service.setSelection({ kind: 'provider', profileId: 'profile-a', modelId: 'model-a' });
    await expect(selection.get()).resolves.toEqual({
      kind: 'provider',
      profileId: 'profile-a',
      modelId: 'model-a',
    });

    await service.setSelection({ kind: 'comfyui', workflowId: 'workflow-a' });
    await service.deleteWorkflow('workflow-a');
    await expect(selection.get()).resolves.toBeUndefined();
    await expect(service.listWorkflows()).resolves.toEqual([]);
  });

  it('keeps mask-entry workflow parseable but not ready or selectable', async () => {
    const { service, selection } = harness(compatibleEvidence);
    await saveConnection(service);
    await service.testConnection('connection-a');
    await service.saveFrontendWorkflow({
      workflowId: 'workflow-mask',
      displayName: 'Mask workflow',
      connectionId: 'connection-a',
      remotePath: 'imagen/mask.json',
      contract: maskContract,
    });

    await expect(service.getWorkflowReadiness('workflow-mask')).resolves.toEqual({
      status: 'not-ready',
      reason: 'workflow',
    });
    await expect(service.setSelection({ kind: 'comfyui', workflowId: 'workflow-mask' })).rejects.toMatchObject({
      category: 'validation',
    });
    await expect(selection.get()).resolves.toBeUndefined();
  });

  it('deletes connection-owned workflows and selected target atomically from the service boundary', async () => {
    const { service, selection } = harness(compatibleEvidence);
    await saveConnection(service);
    await service.testConnection('connection-a');
    await service.saveFrontendWorkflow({
      workflowId: 'workflow-a',
      displayName: 'Workflow A',
      connectionId: 'connection-a',
      remotePath: 'nested/workflow.json',
      contract,
    });
    await service.setSelection({ kind: 'comfyui', workflowId: 'workflow-a' });
    await service.deleteConnection('connection-a');
    await expect(service.listConnections()).resolves.toEqual([]);
    await expect(service.listWorkflows()).resolves.toEqual([]);
    await expect(selection.get()).resolves.toBeUndefined();
  });

  it('rejects unsafe paths and oversized Frontend discovery lists', async () => {
    const { service, discovery } = harness();
    await saveConnection(service);
    await expect(service.saveFrontendWorkflow({
      workflowId: 'workflow-a',
      displayName: 'Workflow A',
      connectionId: 'connection-a',
      remotePath: '../secret.json',
      contract,
    })).rejects.toMatchObject({ category: 'validation' });
    await expect(service.saveFrontendWorkflow({
      workflowId: 'workflow-encoded',
      displayName: 'Workflow A',
      connectionId: 'connection-a',
      remotePath: 'imagen/%2e%2e/workflow.json',
      contract,
    })).rejects.toMatchObject({ category: 'validation' });
    await expect(service.saveFrontendWorkflow({
      workflowId: 'workflow-extension',
      displayName: 'Workflow A',
      connectionId: 'connection-a',
      remotePath: 'imagen/workflow.JSON',
      contract,
    })).rejects.toMatchObject({ category: 'validation' });

    discovery.list.mockResolvedValueOnce(Array.from({ length: 1_001 }, (_, index) => ({
      displayName: `Workflow ${index}`,
      remotePath: `workflow-${index}.json`,
      contract,
    })));
    await expect(service.discoverFrontendWorkflows('connection-a')).rejects.toMatchObject({
      category: 'validation',
    });
  });

  it('imports plain API Format through the canonical graph and contract owners', async () => {
    const { service } = harness();
    await saveConnection(service);
    const bindingDocument = {
      schemaVersion: 1,
      bindings: [
        { role: 'prompt', slot: 0, locator: { nodeId: 'prompt', fieldName: 'text' } },
        { role: 'output-image', slot: 0, locator: { nodeId: 'output', fieldName: 'images' } },
      ],
    };
    const typeDocument = {
      schemaVersion: 1,
      operation: 'text-to-image',
      entries: [
        { role: 'prompt', slot: 0, required: true, dataType: 'text' },
        { role: 'output-image', slot: 0, required: true, dataType: 'image' },
      ],
    };
    const graph = {
      binding: { class_type: 'ImagenWorkflowBindingContract', inputs: { contract: bindingDocument } },
      type: { class_type: 'ImagenWorkflowTypeContract', inputs: { contract: typeDocument } },
      prompt: { class_type: 'Prompt', inputs: { text: '' } },
      output: { class_type: 'Output', inputs: {} },
    };
    const imported = await service.importApiGraph({
      workflowId: 'workflow-api',
      displayName: 'API workflow',
      connectionId: 'connection-a',
      graph,
    });
    expect(imported.source.kind).toBe('api-graph');
    expect(imported.contract.operation).toBe('text-to-image');
    expect(Object.isFrozen(imported)).toBe(true);
    graph.prompt.inputs.text = 'mutated';
    expect(imported.source.kind === 'api-graph' && imported.source.graph.prompt?.inputs.text).toBe('');
    await expect(service.importApiGraph({
      workflowId: 'workflow-frontend-json',
      displayName: 'Bad workflow',
      connectionId: 'connection-a',
      graph: { nodes: [] },
    })).rejects.toThrow('ComfyUI API graph is invalid.');

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(service.importApiGraph({
      workflowId: 'workflow-cycle',
      displayName: 'Bad workflow',
      connectionId: 'connection-a',
      graph: cyclic,
    })).rejects.toThrow('ComfyUI API graph is invalid.');

    const oversized = Object.fromEntries(Array.from({ length: 2_001 }, (_, index) => [
      String(index),
      { class_type: 'Node', inputs: {} },
    ]));
    await expect(service.importApiGraph({
      workflowId: 'workflow-large',
      displayName: 'Bad workflow',
      connectionId: 'connection-a',
      graph: oversized,
    })).rejects.toThrow('ComfyUI API graph is invalid.');

    await expect(service.importApiGraph({
      workflowId: 'workflow-nonfinite',
      displayName: 'Bad workflow',
      connectionId: 'connection-a',
      graph: { node: { class_type: 'Node', inputs: { value: Number.NaN } } },
    })).rejects.toThrow('ComfyUI API graph is invalid.');
  });

  it('exposes readiness, JSON import, and explicit selection cleanup through the service boundary', async () => {
    const { service, selection } = harness();
    await saveConnection(service);
    const bindingDocument = {
      schemaVersion: 1,
      bindings: [
        { role: 'prompt', slot: 0, locator: { nodeId: 'prompt', fieldName: 'text' } },
        { role: 'output-image', slot: 0, locator: { nodeId: 'output', fieldName: 'images' } },
      ],
    };
    const typeDocument = {
      schemaVersion: 1,
      operation: 'text-to-image',
      entries: [
        { role: 'prompt', slot: 0, required: true, dataType: 'text' },
        { role: 'output-image', slot: 0, required: true, dataType: 'image' },
      ],
    };
    const graph = {
      binding: { class_type: 'ImagenWorkflowBindingContract', inputs: { contract: bindingDocument } },
      type: { class_type: 'ImagenWorkflowTypeContract', inputs: { contract: typeDocument } },
      prompt: { class_type: 'Prompt', inputs: { text: '' } },
      output: { class_type: 'Output', inputs: {} },
    };

    await service.importApiGraphJson({
      workflowId: 'workflow-json',
      displayName: 'JSON workflow',
      connectionId: 'connection-a',
      json: JSON.stringify(graph),
    });
    await expect(service.getWorkflowReadiness('workflow-json')).resolves.toEqual({
      status: 'not-ready',
      reason: 'api',
    });
    await service.testConnection('connection-a');
    await expect(service.getWorkflowReadiness('workflow-json')).resolves.toEqual({ status: 'ready' });
    await service.setSelection({ kind: 'comfyui', workflowId: 'workflow-json' });
    await service.clearSelection();
    await expect(selection.get()).resolves.toBeUndefined();
    await expect(service.importApiGraphJson({
      workflowId: 'workflow-malformed',
      displayName: 'Malformed workflow',
      connectionId: 'connection-a',
      json: '{',
    })).rejects.toThrow('ComfyUI API graph JSON is malformed.');
  });
});

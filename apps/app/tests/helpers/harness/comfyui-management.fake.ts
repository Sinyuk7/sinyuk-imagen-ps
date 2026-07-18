import {
  createComfyUiManagementService,
  createInMemoryComfyUiConnectionRepository,
  createInMemoryComfyUiWorkflowRepository,
  createInMemoryGenerationTargetSelectionRepository,
  type ComfyUiConnection,
  type ComfyUiConnectionTestEvidence,
  type ComfyUiDiscoveredWorkflow,
  type ComfyUiWorkflowConfig,
  type GenerationTargetSelection,
} from '@imagen-ps/application';
import { vi } from 'vitest';

export const fakeComfyUiContract = Object.freeze({
  schemaVersion: 1,
  operation: 'text-to-image',
  entries: Object.freeze([
    Object.freeze({
      role: 'prompt',
      slot: 0,
      required: true,
      dataType: 'text',
      locator: Object.freeze({ nodeId: 'prompt', fieldName: 'text' }),
    }),
    Object.freeze({
      role: 'output-image',
      slot: 0,
      required: true,
      dataType: 'image',
      locator: Object.freeze({ nodeId: 'output', fieldName: 'images' }),
    }),
  ]),
}) as unknown as ComfyUiWorkflowConfig['contract'];

export const fakeComfyUiReadyEvidence: ComfyUiConnectionTestEvidence = Object.freeze({
  checkedAt: '2026-07-19T00:00:00.000Z',
  api: 'ready',
  bridge: Object.freeze({
    status: 'compatible',
    protocolVersion: 1,
    bridgeVersion: '1.0.0',
    frontendVersion: '1.45.20',
    coreVersion: '0.27.1',
    contractSchemaVersion: 1,
    contractSchemaDigest: 'a'.repeat(64),
    nativeQueue: true,
  }),
});

export const fakeComfyUiConnection: ComfyUiConnection = Object.freeze({
  connectionId: 'comfyui-studio',
  displayName: 'Studio ComfyUI',
  origin: 'https://comfy.example.test',
  requestTimeoutMs: 30_000,
  configureTimeoutMs: 30_000,
  observationTimeoutMs: 300_000,
  lastTest: fakeComfyUiReadyEvidence,
});

export const fakeComfyUiWorkflow: ComfyUiWorkflowConfig = Object.freeze({
  workflowId: 'workflow-d01',
  displayName: 'D01 Studio',
  connectionId: fakeComfyUiConnection.connectionId,
  source: Object.freeze({
    kind: 'api-graph',
    graph: Object.freeze({
      prompt: Object.freeze({ class_type: 'Prompt', inputs: Object.freeze({ text: '' }) }),
      output: Object.freeze({ class_type: 'Output', inputs: Object.freeze({ images: '' }) }),
    }),
  }),
  contract: fakeComfyUiContract,
});

export interface ComfyUiManagementFakeOptions {
  readonly connections?: readonly ComfyUiConnection[];
  readonly workflows?: readonly ComfyUiWorkflowConfig[];
  readonly selection?: GenerationTargetSelection;
  readonly testEvidence?: ComfyUiConnectionTestEvidence;
  readonly discovered?: readonly ComfyUiDiscoveredWorkflow[];
}

export function createComfyUiManagementFake(options: ComfyUiManagementFakeOptions = {}) {
  const connections = createInMemoryComfyUiConnectionRepository(options.connections ?? []);
  const workflows = createInMemoryComfyUiWorkflowRepository(options.workflows ?? []);
  const selection = createInMemoryGenerationTargetSelectionRepository(options.selection);
  const testConnection = vi.fn(async () => options.testEvidence ?? fakeComfyUiReadyEvidence);
  const discoverFrontendWorkflows = vi.fn(async () => options.discovered ?? [{
    displayName: 'Remote D01',
    remotePath: 'imagen/remote-d01.json',
    contract: fakeComfyUiContract,
  }]);
  const service = createComfyUiManagementService({
    connections,
    workflows,
    selection,
    tester: { test: testConnection },
    discovery: { list: discoverFrontendWorkflows },
  });

  return {
    service,
    repositories: { connections, workflows, selection },
    spies: { testConnection, discoverFrontendWorkflows },
  };
}

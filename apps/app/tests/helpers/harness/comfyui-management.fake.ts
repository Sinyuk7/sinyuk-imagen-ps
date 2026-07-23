import {
  createComfyUiManagementService,
  createComfyUiTestHarness,
  type LoadedWorkflowRuntime,
  type WorkflowIdentity,
  type WorkflowForm,
} from '@imagen-ps/application';
import { vi } from 'vitest';

export interface ComfyUiManagementFakeOptions {
  readonly baseUrl?: string;
  readonly workflows?: readonly WorkflowIdentity[];
  readonly selectedWorkflowId?: string | null;
  readonly form?: WorkflowForm;
  readonly loadError?: Error;
}

const defaultWorkflow: WorkflowIdentity = Object.freeze({
  workflowId: 'workflow-d01',
  displayName: 'D01 Studio',
  remotePath: 'saved/d01.json',
  groupPath: ['saved'],
  revision: 'rev-1',
});

const defaultForm: WorkflowForm = Object.freeze({
  nodes: Object.freeze([{
    nodeId: 'prompt',
    title: '# Prompt',
    label: 'Prompt',
    order: 0,
    active: true,
    visible: true,
    widgets: Object.freeze([{
      ref: Object.freeze({ nodeId: 'prompt', inputName: 'text' }),
      kind: 'string',
      label: 'Prompt',
      workflowValue: '',
      writable: true,
      visible: true,
      order: 0,
    }]),
  }]),
});

export function createComfyUiManagementFake(options: ComfyUiManagementFakeOptions = {}) {
  const workflows = options.workflows ?? [defaultWorkflow];
  const baseUrl = options.baseUrl ?? 'https://comfy.example.test';
  const hasConfiguredServer = options.baseUrl !== undefined;
  const selectedWorkflowId = options.selectedWorkflowId === undefined ? workflows[0]?.workflowId ?? null : options.selectedWorkflowId;
  const harness = createComfyUiTestHarness(hasConfiguredServer
    ? { baseUrl, selectedWorkflowId, ambiguousMappingsByRevision: {} }
    : undefined);
  const discover = vi.fn(async () => workflows);
  const open = vi.fn(async () => undefined);
  const load = vi.fn(async (_origin: string, identity: WorkflowIdentity): Promise<LoadedWorkflowRuntime> => {
    if (options.loadError) throw options.loadError;
    return {
      identity: { ...identity, revision: identity.revision ?? 'rev-1' },
      document: { kind: 'frontend', workflow: { nodes: [] } },
      form: options.form ?? defaultForm,
      capabilities: { api: 'unknown', frontend: 'ready', bridge: 'compatible' },
    };
  });
  const service = createComfyUiManagementService({
    state: harness.state,
    cache: harness.cache,
    drafts: harness.drafts,
    ports: {
      discover,
      load,
      open,
    },
    generationFactory: harness.connectionPorts.generationFactory,
    validateApi: harness.connectionPorts.validateApi,
    validateBridge: harness.connectionPorts.validateBridge,
  });

  return {
    service,
    harness,
    spies: { discover, load, open },
  };
}

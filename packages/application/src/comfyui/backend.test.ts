import {
  COMFYUI_BRIDGE_COMPATIBILITY,
  parseComfyUiWorkflowContract,
  type ComfyUiExecutionAssetInput,
  type ComfyUiWorkflowContract,
} from '@imagen-ps/execution-backend-comfyui';
import { describe, expect, it } from 'vitest';
import type { Job } from '@imagen-ps/core-engine';
import type { TaskRecord } from '../task.js';
import { admitGeneration } from '../generation/admission.js';
import {
  COMFYUI_CONNECTION_LANE_MAX_CONCURRENCY,
  COMFYUI_GENERATION_BACKEND_ID,
  comfyUiExecutionInput,
  createComfyUiGenerationBackend,
} from './backend.js';
import {
  createInMemoryComfyUiConnectionRepository,
  createInMemoryComfyUiWorkflowRepository,
} from './repositories.js';
import type { ComfyUiConnection, ComfyUiWorkflowConfig } from './types.js';

const createdAt = '2026-07-18T00:00:00.000Z';
const storedRef = Object.freeze({
  kind: 'hostObject' as const,
  ref: 'input-a',
  mimeType: 'image/png',
  byteSize: 128,
});
const image: ComfyUiExecutionAssetInput = Object.freeze({ storedRef, width: 512, height: 512 });

const binding = {
  schemaVersion: 1,
  bindings: [
    { role: 'prompt', slot: 0, locator: { nodeId: 'prompt-node', fieldName: 'text' } },
    { role: 'image', slot: 0, locator: { nodeId: 'image-node', fieldName: 'image' } },
    { role: 'output-image', slot: 0, locator: { nodeId: 'output-node', fieldName: 'images' } },
  ],
} as const;
const type = {
  schemaVersion: 1,
  operation: 'image-edit',
  entries: [
    { role: 'prompt', slot: 0, required: true, dataType: 'text' },
    { role: 'image', slot: 0, required: true, dataType: 'image' },
    { role: 'output-image', slot: 0, required: true, dataType: 'image' },
  ],
} as const;
const contract: ComfyUiWorkflowContract = parseComfyUiWorkflowContract(binding, type);
const maskContract: ComfyUiWorkflowContract = parseComfyUiWorkflowContract({
  ...binding,
  bindings: [
    ...binding.bindings,
    { role: 'mask', slot: 0, locator: { nodeId: 'mask-node', fieldName: 'image' } },
  ],
}, {
  ...type,
  entries: [
    ...type.entries,
    { role: 'mask', slot: 0, required: false, dataType: 'mask', maskEncoding: 'grayscale' },
  ],
});

function connection(bridge = true): ComfyUiConnection {
  return {
    connectionId: 'connection-a',
    displayName: 'Studio ComfyUI',
    origin: 'https://comfy.example.test',
    requestTimeoutMs: 30_000,
    configureTimeoutMs: 30_000,
    observationTimeoutMs: 300_000,
    lastTest: {
      checkedAt: createdAt,
      api: 'ready',
      ...(bridge ? {
        bridge: {
          status: 'compatible',
          nativeQueue: true,
          protocolVersion: COMFYUI_BRIDGE_COMPATIBILITY.protocolVersion,
          bridgeVersion: COMFYUI_BRIDGE_COMPATIBILITY.bridgeVersion,
          frontendVersion: COMFYUI_BRIDGE_COMPATIBILITY.frontendVersion,
          coreVersion: COMFYUI_BRIDGE_COMPATIBILITY.coreVersion,
          contractSchemaVersion: COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaVersion,
          contractSchemaDigest: COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaSha256,
        },
      } : {}),
    },
  };
}

function frontendWorkflow(): ComfyUiWorkflowConfig {
  return {
    workflowId: 'workflow-a',
    displayName: 'D01 Edit',
    connectionId: 'connection-a',
    source: { kind: 'frontend-workflow', remotePath: 'imagen/d01.json' },
    contract,
  };
}

function maskFrontendWorkflow(): ComfyUiWorkflowConfig {
  return {
    ...frontendWorkflow(),
    contract: maskContract,
  };
}

function runningTask(): TaskRecord {
  return {
    schemaVersion: 2,
    taskId: 'task-a',
    status: 'running',
    operation: 'image-edit',
    prompt: 'edit this image',
    attachments: [{
      kind: 'photoshop-capture',
      attachmentId: 'attachment-a',
      asset: { ref: storedRef, width: 512, height: 512 },
      executionInput: { ref: storedRef, width: 512, height: 512 },
    }],
    outputs: [],
    placement: { kind: 'exact-frame', sourceSnapshotId: 'snapshot-a' },
    createdAt,
    updatedAt: createdAt,
  };
}

function backendHarness(workflow = frontendWorkflow(), connectionValue = connection()) {
  const connections = createInMemoryComfyUiConnectionRepository([connectionValue]);
  const workflows = createInMemoryComfyUiWorkflowRepository([workflow]);
  const backend = createComfyUiGenerationBackend({
    connections,
    workflows,
    now: () => '2026-07-18T00:01:00.000Z',
  });
  return { backend, connections, workflows };
}

async function admittedGeneration(workflow = frontendWorkflow(), connectionValue = connection()) {
  const { backend } = backendHarness(workflow, connectionValue);
  const admitted = await admitGeneration(backend, {
    taskId: 'task-a',
    backendId: COMFYUI_GENERATION_BACKEND_ID,
    payload: {
      workflowId: 'workflow-a',
      prompt: 'edit this image',
      images: [image],
      runningTask: runningTask(),
    },
  });
  return { backend, admitted };
}

function jobFor(admitted: Awaited<ReturnType<typeof admittedGeneration>>['admitted'], input: {
  readonly status: 'completed' | 'failed';
  readonly output?: Job['output'];
  readonly error?: Job['error'];
}): Job {
  return {
    id: 'job-a',
    status: input.status,
    input: admitted.execution.input,
    output: input.output,
    error: input.error,
    createdAt,
    updatedAt: '2026-07-18T00:00:10.000Z',
  };
}

describe('ComfyUiGenerationBackend contract', () => {
  it('admits durable refs through one backend lane without changing TaskPlacement', async () => {
    const { admitted } = await admittedGeneration();
    const request = comfyUiExecutionInput(admitted);
    expect(admitted.backendId).toBe('comfyui');
    expect(admitted.execution.workflow).toBe('comfyui-generation');
    expect(admitted.lane).toEqual({
      key: 'comfyui:connection-a',
      maxConcurrency: COMFYUI_CONNECTION_LANE_MAX_CONCURRENCY,
    });
    expect(admitted.runningTask.placement).toEqual({ kind: 'exact-frame', sourceSnapshotId: 'snapshot-a' });
    expect(admitted.runningTask.execution).toEqual({
      backend: { id: 'comfyui', label: 'ComfyUI' },
      connection: { id: 'connection-a', label: 'Studio ComfyUI' },
      target: { id: 'workflow-a', label: 'D01 Edit' },
    });
    expect(request).toMatchObject({
      connection: { connectionId: 'connection-a', origin: 'https://comfy.example.test' },
      source: { kind: 'frontend-workflow', workflowId: 'workflow-a', remotePath: 'imagen/d01.json' },
      prompt: 'edit this image',
      images: [image],
    });
    expect(JSON.stringify(request)).not.toMatch(/promptId|operationId|receipt/i);
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('keeps API readiness independent from Bridge and requires exact Bridge tuple for Frontend', async () => {
    const noBridge = connection(false);
    const apiWorkflow: ComfyUiWorkflowConfig = {
      ...frontendWorkflow(),
      source: {
        kind: 'api-graph',
        graph: {
          'binding-contract': { class_type: 'ImagenWorkflowBindingContract', inputs: { contract: binding } },
          'type-contract': { class_type: 'ImagenWorkflowTypeContract', inputs: { contract: type } },
          'prompt-node': { class_type: 'Prompt', inputs: { text: '' } },
          'image-node': { class_type: 'Image', inputs: { image: '' } },
          'output-node': { class_type: 'Output', inputs: {} },
        },
      },
    };
    const api = await admittedGeneration(apiWorkflow, noBridge);
    await expect(api.backend.checkReadiness(api.admitted)).resolves.toEqual({ status: 'ready' });

    const frontend = await admittedGeneration(frontendWorkflow(), noBridge);
    await expect(frontend.backend.checkReadiness(frontend.admitted)).resolves.toMatchObject({ status: 'wait' });
  });

  it('rejects mask-entry workflows before admission and after a saved workflow changes', async () => {
    await expect(admittedGeneration(maskFrontendWorkflow())).rejects.toMatchObject({
      category: 'validation',
      details: { code: 'not-ready/workflow' },
    });

    const harness = backendHarness();
    const admitted = await admitGeneration(harness.backend, {
      taskId: 'task-a',
      backendId: COMFYUI_GENERATION_BACKEND_ID,
      payload: {
        workflowId: 'workflow-a',
        prompt: 'edit this image',
        images: [image],
        runningTask: runningTask(),
      },
    });
    await harness.workflows.save(maskFrontendWorkflow());
    await expect(harness.backend.checkReadiness(admitted)).resolves.toMatchObject({
      status: 'reject',
      error: {
        category: 'validation',
        details: { code: 'not-ready/workflow' },
      },
    });
  });

  it('projects canonical outputs and warnings into generic Task outputs', async () => {
    const { backend, admitted } = await admittedGeneration();
    const outputRef = { kind: 'hostObject' as const, ref: 'output-a', mimeType: 'image/png' };
    const job = jobFor(admitted, {
      status: 'completed',
      output: {
        comfyui: {
          outputs: [outputRef],
          warnings: [{ code: 'optional-output-missing', messageKey: 'comfyui.warning.optional-output-missing' }],
        },
      },
    });
    const projected = await backend.projectTerminal({
      admitted,
      job,
      runningTask: { ...admitted.runningTask, latestJobId: job.id },
    });
    expect(projected.status).toBe('completed');
    expect(projected.outputs).toEqual([{
      outputId: 'task-a:output:0',
      index: 0,
      kind: 'image',
      asset: { ref: outputRef },
      evidence: {
        warnings: [{ code: 'optional-output-missing', messageKey: 'comfyui.warning.optional-output-missing' }],
      },
    }]);
  });

  it('allows same Task Retry only for deterministic pre-submission errors', async () => {
    const { backend, admitted } = await admittedGeneration();
    const failed = jobFor(admitted, {
      status: 'failed',
      error: {
        category: 'execution',
        message: 'ComfyUI execution failed.',
        details: {
          stage: 'upload',
          code: 'upload-failed',
          messageKey: 'comfyui.error.upload-failed',
          remoteMayContinue: false,
          retryDisposition: 'same-task-new-job',
        },
      },
    });
    const task = await backend.projectTerminal({
      admitted,
      job: failed,
      runningTask: { ...admitted.runningTask, latestJobId: failed.id },
    });
    await expect(backend.retry?.({ task, latestJob: failed })).resolves.toMatchObject({
      taskId: task.taskId,
      retry: { allowed: true },
    });

    const unknown = jobFor(admitted, {
      status: 'failed',
      error: {
        category: 'execution',
        message: 'ComfyUI execution failed.',
        details: {
          stage: 'submit',
          code: 'submission-unknown',
          messageKey: 'comfyui.error.submission-unknown',
          remoteMayContinue: true,
          retryDisposition: 'new-task-only',
        },
      },
    });
    const unknownTask = await backend.projectTerminal({
      admitted,
      job: unknown,
      runningTask: { ...admitted.runningTask, latestJobId: unknown.id },
    });
    expect(unknownTask.error?.details).toEqual({ remoteMayContinue: true });
    await expect(backend.retry?.({ task: unknownTask, latestJob: unknown })).rejects.toMatchObject({
      category: 'validation',
    });
  });
});

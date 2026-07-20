import { createImmutableSnapshot, createValidationError, type StoredAssetRef } from '@imagen-ps/core-engine';
import type { TaskError, TaskOutput, TaskRecord } from '../task.js';
import { assertTaskRecord } from '../task.js';
import { normalizeAdmittedGeneration, normalizeGenerationCommand } from '../generation/admission.js';
import type {
  AdmittedGeneration,
  GenerationBackend,
  GenerationCommand,
  ReadinessDecision,
  RetryGenerationInput,
  TerminalProjectionInput,
} from '../generation/types.js';
import type {
  ComfyUiExecutionAssetInput,
  ComfyUiExecutionIntent,
  ComfyUiExecutionMaskInput,
  ComfyUiGenerationPayload,
} from './types.js';

export const COMFYUI_GENERATION_BACKEND_ID = 'comfyui';
export const COMFYUI_CONNECTION_LANE_MAX_CONCURRENCY = 1;
export const COMFYUI_GENERATION_WORKFLOW = 'comfyui-generation';

export interface ComfyUiGenerationBackendDependencies {
  readonly runtime: {
    getExecution(workflowId: string, revision?: string): Promise<ComfyUiExecutionIntent>;
  };
  readonly now?: () => string;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown, path: string, max = 256): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw createValidationError(`${path} is invalid.`, { path });
  return value.trim();
}
function assets(value: unknown): readonly ComfyUiExecutionAssetInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) throw createValidationError('ComfyUI images are invalid.');
  return value as readonly ComfyUiExecutionAssetInput[];
}
function asset(value: unknown, path: string): ComfyUiExecutionAssetInput {
  if (!record(value) || Object.keys(value).some((key) => !['storedRef', 'width', 'height'].includes(key))) throw createValidationError(`${path} is invalid.`);
  if (!record(value.storedRef) || Object.keys(value.storedRef).some((key) => !['kind', 'ref', 'name', 'mimeType', 'sha256', 'byteSize'].includes(key))) throw createValidationError(`${path}.storedRef is invalid.`);
  if (!['inline', 'url', 'hostObject', 'externalToken'].includes(String(value.storedRef.kind)) || typeof value.storedRef.ref !== 'string' || value.storedRef.ref.length === 0) throw createValidationError(`${path}.storedRef is invalid.`);
  if (!Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || Number(value.width) < 1 || Number(value.height) < 1) throw createValidationError(`${path} is invalid.`);
  return { storedRef: value.storedRef as unknown as StoredAssetRef, width: Number(value.width), height: Number(value.height) };
}
function mask(value: unknown): ComfyUiExecutionMaskInput | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || Object.keys(value).some((key) => !['asset', 'binding'].includes(key)) || !record(value.binding)) throw createValidationError('ComfyUI Mask is invalid.');
  const binding = value.binding;
  if (Object.keys(binding).some((key) => !['transport', 'inputRef', 'polarity'].includes(key)) || binding.transport !== 'separate-image-input' || (binding.polarity !== 'white-edit' && binding.polarity !== 'black-edit')) throw createValidationError('ComfyUI Mask is invalid.');
  const input = inputRef(binding.inputRef);
  if (input === undefined) throw createValidationError('ComfyUI Mask is invalid.');
  return { asset: asset(value.asset, 'ComfyUI Mask asset'), binding: { transport: 'separate-image-input', inputRef: input, polarity: binding.polarity } };
}
function inputRef(value: unknown): import('./types.js').WorkflowInputRef | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || Object.keys(value).some((key) => !['nodeId', 'inputName', 'widgetIndex'].includes(key))) throw createValidationError('ComfyUI image input ref is invalid.');
  const nodeId = text(value.nodeId, 'ComfyUiGenerationPayload.imageInputRef.nodeId');
  const inputName = value.inputName === undefined ? undefined : text(value.inputName, 'ComfyUiGenerationPayload.imageInputRef.inputName');
  const widgetIndex = value.widgetIndex;
  if (widgetIndex !== undefined && (!Number.isSafeInteger(widgetIndex) || Number(widgetIndex) < 0)) throw createValidationError('ComfyUI image input ref is invalid.');
  if (inputName === undefined && widgetIndex === undefined) throw createValidationError('ComfyUI image input ref is invalid.');
  return { nodeId, ...(inputName === undefined ? {} : { inputName }), ...(widgetIndex === undefined ? {} : { widgetIndex: Number(widgetIndex) }) };
}
function payload(command: GenerationCommand): ComfyUiGenerationPayload {
  if (!record(command.payload)) throw createValidationError('ComfyUiGenerationPayload must be a record.');
  const value = command.payload;
  if (Object.keys(value).some((key) => !['workflowId', 'prompt', 'images', 'runningTask', 'revision', 'formValues', 'mutations', 'imageInputRef', 'mask'].includes(key))) throw createValidationError('ComfyUiGenerationPayload contains unsupported field.');
  if (!record(value.runningTask)) throw createValidationError('ComfyUI running Task is invalid.');
  assertTaskRecord(value.runningTask as unknown as TaskRecord);
  const executionMask = mask(value.mask);
  return {
    workflowId: text(value.workflowId, 'ComfyUiGenerationPayload.workflowId'),
    ...(value.prompt === undefined ? {} : { prompt: text(value.prompt, 'ComfyUiGenerationPayload.prompt', 65_536) }),
    images: assets(value.images),
    runningTask: value.runningTask as unknown as TaskRecord,
    ...(value.revision === undefined ? {} : { revision: text(value.revision, 'ComfyUiGenerationPayload.revision') }),
    ...(record(value.formValues) ? { formValues: value.formValues as ComfyUiGenerationPayload['formValues'] } : {}),
    ...(Array.isArray(value.mutations) ? { mutations: value.mutations as ComfyUiGenerationPayload['mutations'] } : {}),
    ...(inputRef(value.imageInputRef) ? { imageInputRef: inputRef(value.imageInputRef) } : {}),
    ...(executionMask === undefined ? {} : { mask: executionMask }),
  };
}

function taskError(value: unknown): TaskError {
  const input = record(value) ? value : {};
  const details = record(input.details) ? input.details : {};
  return {
    category: input.category === 'validation' || input.category === 'execution' || input.category === 'storage' || input.category === 'interrupted' ? input.category : 'execution',
    message: typeof input.message === 'string' ? input.message.slice(0, 512) : 'ComfyUI execution failed.',
    ...(typeof details.code === 'string' ? { code: details.code } : {}),
    ...(details.remoteMayContinue === true ? { details: { remoteMayContinue: true } } : {}),
  };
}

function outputsForTask(taskId: string, result: unknown): readonly TaskOutput[] {
  const outputs = record(result) && Array.isArray(result.outputs) ? result.outputs : [];
  const warnings = record(result) && Array.isArray(result.warnings) && result.warnings.length > 0 ? result.warnings : undefined;
  return outputs.map((asset, index) => ({ outputId: `${taskId}:output:${index}`, index, kind: 'image', asset: { ref: asset as never }, ...(warnings === undefined ? {} : { evidence: { warnings } }) }));
}

export function comfyUiExecutionInput(admitted: AdmittedGeneration): ComfyUiExecutionIntent {
  if (admitted.backendId !== COMFYUI_GENERATION_BACKEND_ID || admitted.execution.workflow !== COMFYUI_GENERATION_WORKFLOW) throw createValidationError('ComfyUI backend received an admission owned by another backend.');
  const input = admitted.execution.input;
  if (!record(input) || !record(input.request)) throw createValidationError('ComfyUI execution request is invalid.');
  return input.request as unknown as ComfyUiExecutionIntent;
}

export function createComfyUiGenerationBackend(dependencies: ComfyUiGenerationBackendDependencies): GenerationBackend {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const backend: GenerationBackend = {
    id: COMFYUI_GENERATION_BACKEND_ID,
    async admit(command) {
      const normalized = normalizeGenerationCommand(command);
      if (normalized.backendId !== COMFYUI_GENERATION_BACKEND_ID) throw createValidationError('ComfyUI backend received a command for another backend.');
      const value = payload(normalized);
      const intent = await dependencies.runtime.getExecution(value.workflowId, value.revision);
      if (value.mask !== undefined && value.revision !== intent.source.revision) throw createValidationError('ComfyUI Mask binding is stale.');
      const images = (value.images ?? []).slice(0, 1);
      const running = value.runningTask;
      if (running.taskId !== normalized.taskId || running.status !== 'running' || running.latestJobId !== undefined) throw createValidationError('ComfyUI running Task identity is invalid.');
      const input = { ...intent, ...(value.prompt === undefined ? {} : { prompt: value.prompt }), images, ...(value.mutations === undefined ? {} : { mutations: value.mutations }), ...(value.imageInputRef === undefined ? {} : { imageInputRef: value.imageInputRef }), ...(value.mask === undefined ? {} : { mask: value.mask }) };
      const execution = { workflow: COMFYUI_GENERATION_WORKFLOW, input: { request: input } };
      const admitted: AdmittedGeneration = { taskId: normalized.taskId, backendId: COMFYUI_GENERATION_BACKEND_ID, execution, runningTask: running, lane: { key: 'comfyui:default', maxConcurrency: COMFYUI_CONNECTION_LANE_MAX_CONCURRENCY }, retry: { allowed: true } };
      return normalizeAdmittedGeneration(normalized, backend.id, admitted);
    },
    async checkReadiness(submission): Promise<ReadinessDecision> {
      try { const request = comfyUiExecutionInput(submission); if (!request.connection.baseUrl) throw new Error(); return { status: 'ready' }; }
      catch { return { status: 'reject', error: createValidationError('ComfyUI workflow is no longer available.') }; }
    },
    async projectTerminal(input: TerminalProjectionInput): Promise<TaskRecord> {
      if (input.job.status !== 'completed' && input.job.status !== 'failed') throw createValidationError('ComfyUI terminal projection requires terminal Job.');
      const base = { ...input.runningTask, latestJobId: input.job.id, updatedAt: input.job.updatedAt, finishedAt: input.job.updatedAt };
      const projected: TaskRecord = input.job.status === 'completed'
        ? { ...base, status: 'completed', outputs: outputsForTask(input.runningTask.taskId, input.job.output?.comfyui) }
        : { ...base, status: 'failed', outputs: [], error: taskError(input.job.error) };
      assertTaskRecord(projected); return createImmutableSnapshot(projected) as TaskRecord;
    },
    async retry(input: RetryGenerationInput): Promise<AdmittedGeneration> {
      const errorDetails = record(input.latestJob.error) && record(input.latestJob.error.details) ? input.latestJob.error.details : {};
      if (input.task.status !== 'failed' || input.latestJob.status !== 'failed' || errorDetails.remoteMayContinue === true) throw createValidationError('ComfyUI Retry is not available.');
      const request = comfyUiExecutionInput({ ...input.latestJob.input, backendId: COMFYUI_GENERATION_BACKEND_ID, execution: input.latestJob.input, taskId: input.task.taskId, runningTask: input.task, retry: { allowed: true } } as unknown as AdmittedGeneration);
      const { latestJobId: _latestJobId, finishedAt: _finishedAt, error: _error, ...retryTask } = input.task;
      const editRegion = input.task.editRegion;
      return backend.admit({ taskId: input.task.taskId, backendId: COMFYUI_GENERATION_BACKEND_ID, payload: { workflowId: request.source.workflowId, prompt: request.prompt, images: request.images, revision: request.source.revision, ...(request.mutations ? { mutations: request.mutations } : {}), ...(request.imageInputRef ? { imageInputRef: request.imageInputRef } : {}), ...(editRegion === undefined || request.mask === undefined ? {} : { mask: { asset: { storedRef: editRegion.mask.ref, width: editRegion.geometry.targetWidth, height: editRegion.geometry.targetHeight }, binding: request.mask.binding } }), runningTask: { ...retryTask, status: 'running', updatedAt: now() } } });
    },
  };
  return backend;
}

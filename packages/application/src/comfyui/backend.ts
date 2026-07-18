import {
  COMFYUI_BRIDGE_COMPATIBILITY,
  type ComfyUiExecutionAssetInput,
  type ComfyUiExecutionRequest,
  type ComfyUiExecutionResult,
  type ComfyUiWorkflowContract,
  validateCanonicalComfyUiWorkflowContract,
  validateComfyUiApiGraphTargets,
  validateComfyUiExecutionRequest,
  validateComfyUiExecutionResult,
} from '@imagen-ps/execution-backend-comfyui';
import {
  createImmutableSnapshot,
  createValidationError,
} from '@imagen-ps/core-engine';
import {
  assertTaskRecord,
  type TaskError,
  type TaskOutput,
  type TaskRecord,
} from '../task.js';
import {
  normalizeAdmittedGeneration,
  normalizeGenerationCommand,
} from '../generation/admission.js';
import type {
  AdmittedGeneration,
  GenerationBackend,
  GenerationCommand,
  ReadinessDecision,
  RetryGenerationInput,
  TerminalProjectionInput,
} from '../generation/types.js';
import type {
  ComfyUiConnection,
  ComfyUiConnectionRepository,
  ComfyUiGenerationPayload,
  ComfyUiWorkflowConfig,
  ComfyUiWorkflowRepository,
} from './types.js';
import {
  assertComfyUiImageOnlyWorkflow,
  createComfyUiWorkflowNotReadyError,
  hasComfyUiMaskEntry,
} from './workflow-policy.js';

/** ComfyUI generation policy 的稳定 backend id。 */
export const COMFYUI_GENERATION_BACKEND_ID = 'comfyui';

/** ComfyUI connection lane 的固定并发上限。 */
export const COMFYUI_CONNECTION_LANE_MAX_CONCURRENCY = 1;

/** ComfyUI backend 使用的 stable Application workflow。 */
export const COMFYUI_GENERATION_WORKFLOW = 'comfyui-generation';

/** ComfyUI GenerationBackend 的 repository dependencies。 */
export interface ComfyUiGenerationBackendDependencies {
  readonly connections: Pick<ComfyUiConnectionRepository, 'get'>;
  readonly workflows: Pick<ComfyUiWorkflowRepository, 'get'>;
  readonly now?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const expected = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw createValidationError(`${path} contains unsupported field.`, { path: `${path}.${key}` });
    }
  }
}

function nonEmptyString(value: unknown, path: string, max = 65_536): string {
  if (typeof value !== 'string') {
    throw createValidationError(`${path} must be a string.`, { path });
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw createValidationError(`${path} is invalid.`, { path });
  }
  return normalized;
}

function assertStoredAssetInput(value: unknown, path: string): asserts value is ComfyUiExecutionAssetInput {
  if (!isRecord(value)) {
    throw createValidationError(`${path} must be a record.`, { path });
  }
  assertAllowedKeys(value, ['storedRef', 'width', 'height'], path);
  if (!isRecord(value.storedRef)) {
    throw createValidationError(`${path}.storedRef must be a StoredAssetRef.`, { path: `${path}.storedRef` });
  }
  assertAllowedKeys(value.storedRef, ['kind', 'ref', 'mimeType', 'name', 'byteSize', 'sha256'], `${path}.storedRef`);
  if (!['inline', 'url', 'hostObject', 'externalToken'].includes(String(value.storedRef.kind))) {
    throw createValidationError(`${path}.storedRef.kind is invalid.`, { path: `${path}.storedRef.kind` });
  }
  nonEmptyString(value.storedRef.ref, `${path}.storedRef.ref`, 2_048);
  for (const key of ['width', 'height'] as const) {
    if (typeof value[key] !== 'number' || !Number.isInteger(value[key]) || value[key] <= 0 || value[key] > 65_535) {
      throw createValidationError(`${path}.${key} is invalid.`, { path: `${path}.${key}` });
    }
  }
}

function generationPayload(command: GenerationCommand): ComfyUiGenerationPayload {
  if (!isRecord(command.payload)) {
    throw createValidationError('ComfyUiGenerationPayload must be a record.');
  }
  assertAllowedKeys(command.payload, ['workflowId', 'prompt', 'images', 'mask', 'runningTask'], 'ComfyUiGenerationPayload');
  nonEmptyString(command.payload.workflowId, 'ComfyUiGenerationPayload.workflowId', 128);
  nonEmptyString(command.payload.prompt, 'ComfyUiGenerationPayload.prompt');
  if (!Array.isArray(command.payload.images) || command.payload.images.length > 32) {
    throw createValidationError('ComfyUiGenerationPayload.images is invalid.');
  }
  command.payload.images.forEach((image, index) => assertStoredAssetInput(image, `ComfyUiGenerationPayload.images[${index}]`));
  if (command.payload.mask !== undefined) {
    assertStoredAssetInput(command.payload.mask, 'ComfyUiGenerationPayload.mask');
  }
  assertTaskRecord(command.payload.runningTask);
  return command.payload as unknown as ComfyUiGenerationPayload;
}

function inputEntries(contract: ComfyUiWorkflowContract, role: 'image' | 'mask') {
  return contract.entries.filter((entry) => entry.role === role).sort((left, right) => left.slot - right.slot);
}

function assertContractInputs(contract: ComfyUiWorkflowContract, payload: ComfyUiGenerationPayload): void {
  const imageEntries = inputEntries(contract, 'image');
  const missingRequiredSlot = imageEntries.find((entry) => entry.required && payload.images[entry.slot] === undefined);
  if (missingRequiredSlot !== undefined || payload.images.length > imageEntries.length) {
    throw createValidationError('ComfyUI image inputs do not match the workflow contract.', {
      ...(missingRequiredSlot === undefined ? {} : { missingRequiredSlot: missingRequiredSlot.slot }),
      maximumImages: imageEntries.length,
      actualImages: payload.images.length,
    });
  }
  const maskEntry = inputEntries(contract, 'mask')[0];
  if (maskEntry?.required === true && payload.mask === undefined) {
    throw createValidationError('ComfyUI workflow requires a mask input.');
  }
  if (maskEntry === undefined && payload.mask !== undefined) {
    throw createValidationError('ComfyUI workflow does not declare a mask input.');
  }
}

function refKey(asset: ComfyUiExecutionAssetInput): string {
  return `${asset.storedRef.kind}:${asset.storedRef.ref}`;
}

function assertTaskInputEvidence(task: TaskRecord, payload: ComfyUiGenerationPayload): void {
  const durableInputs = new Set(task.attachments.flatMap((attachment) => (
    attachment.executionInput === undefined
      ? []
      : [`${attachment.executionInput.ref.kind}:${attachment.executionInput.ref.ref}`]
  )));
  for (const asset of [...payload.images, ...(payload.mask === undefined ? [] : [payload.mask])]) {
    if (!durableInputs.has(refKey(asset))) {
      throw createValidationError('ComfyUI execution input is missing matching Task attachment evidence.', {
        taskId: task.taskId,
      });
    }
  }
}

function runningTaskForAdmission(args: {
  readonly command: GenerationCommand;
  readonly payload: ComfyUiGenerationPayload;
  readonly connection: ComfyUiConnection;
  readonly workflow: ComfyUiWorkflowConfig;
  readonly contract: ComfyUiWorkflowContract;
  readonly prompt: string;
}): TaskRecord {
  const task = args.payload.runningTask;
  if (task.taskId !== args.command.taskId || task.status !== 'running' || task.latestJobId !== undefined) {
    throw createValidationError('ComfyUI running Task does not match admission identity or state.');
  }
  if (task.prompt !== args.prompt || task.operation !== args.contract.operation) {
    throw createValidationError('ComfyUI running Task does not match workflow operation or prompt.');
  }
  assertTaskInputEvidence(task, args.payload);
  const normalized: TaskRecord = {
    ...task,
    execution: {
      backend: { id: COMFYUI_GENERATION_BACKEND_ID, label: 'ComfyUI' },
      connection: { id: args.connection.connectionId, label: args.connection.displayName },
      target: { id: args.workflow.workflowId, label: args.workflow.displayName },
    },
  };
  assertTaskRecord(normalized);
  return normalized;
}

function executionRequest(args: {
  readonly connection: ComfyUiConnection;
  readonly workflow: ComfyUiWorkflowConfig;
  readonly contract: ComfyUiWorkflowContract;
  readonly prompt: string;
  readonly images: readonly ComfyUiExecutionAssetInput[];
  readonly mask?: ComfyUiExecutionAssetInput;
}): ComfyUiExecutionRequest {
  const source = args.workflow.source.kind === 'api-graph'
    ? {
        kind: 'api-graph' as const,
        workflowId: args.workflow.workflowId,
        graph: args.workflow.source.graph,
      }
    : {
        kind: 'frontend-workflow' as const,
        workflowId: args.workflow.workflowId,
        remotePath: args.workflow.source.remotePath,
      };
  return validateComfyUiExecutionRequest({
    connection: {
      connectionId: args.connection.connectionId,
      origin: args.connection.origin,
      requestTimeoutMs: args.connection.requestTimeoutMs,
      observationTimeoutMs: args.connection.observationTimeoutMs,
    },
    source,
    contract: args.contract,
    prompt: args.prompt,
    images: args.images,
    ...(args.mask === undefined ? {} : { mask: args.mask }),
  });
}

/** 从 admitted generation 读取 package-owned ComfyUI request。 */
export function comfyUiExecutionInput(admitted: AdmittedGeneration): ComfyUiExecutionRequest {
  if (admitted.backendId !== COMFYUI_GENERATION_BACKEND_ID || admitted.execution.workflow !== COMFYUI_GENERATION_WORKFLOW) {
    throw createValidationError('ComfyUI backend received an admission owned by another backend.');
  }
  const input = admitted.execution.input;
  if (!isRecord(input)) {
    throw createValidationError('ComfyUI execution input must be a record.');
  }
  assertAllowedKeys(input, ['request'], 'ComfyUiExecutionInput');
  if (!isRecord(input.request)) {
    throw createValidationError('ComfyUI execution request must be a record.');
  }
  return validateComfyUiExecutionRequest(input.request);
}

function bridgeReady(connection: ComfyUiConnection): boolean {
  const bridge = connection.lastTest?.bridge;
  return connection.lastTest?.api === 'ready'
    && bridge?.status === 'compatible'
    && bridge.nativeQueue === true
    && bridge.protocolVersion === COMFYUI_BRIDGE_COMPATIBILITY.protocolVersion
    && bridge.bridgeVersion === COMFYUI_BRIDGE_COMPATIBILITY.bridgeVersion
    && bridge.frontendVersion === COMFYUI_BRIDGE_COMPATIBILITY.frontendVersion
    && bridge.coreVersion === COMFYUI_BRIDGE_COMPATIBILITY.coreVersion
    && bridge.contractSchemaVersion === COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaVersion
    && bridge.contractSchemaDigest === COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaSha256;
}

function readinessFor(connection: ComfyUiConnection, workflow: ComfyUiWorkflowConfig): ReadinessDecision {
  if (connection.lastTest?.api !== 'ready') {
    return {
      status: 'wait',
      reason: createValidationError('ComfyUI connection is not ready.', { connectionId: connection.connectionId }),
    };
  }
  if (workflow.source.kind === 'frontend-workflow' && !bridgeReady(connection)) {
    return {
      status: 'wait',
      reason: createValidationError('ComfyUI Frontend Bridge is not compatible.', {
        connectionId: connection.connectionId,
      }),
    };
  }
  return { status: 'ready' };
}

function outputsForTask(taskId: string, result: ComfyUiExecutionResult): readonly TaskOutput[] {
  const warnings = result.warnings.length === 0 ? undefined : { warnings: result.warnings };
  return result.outputs.map((ref, index) => ({
    outputId: `${taskId}:output:${index}`,
    index,
    kind: 'image',
    asset: { ref },
    ...(warnings === undefined ? {} : { evidence: warnings }),
  }));
}

function boundedTaskError(jobError: TerminalProjectionInput['job']['error']): TaskError {
  const details = isRecord(jobError?.details) ? jobError.details : {};
  const code = typeof details.code === 'string' ? details.code : undefined;
  const remoteMayContinue = details.remoteMayContinue === true;
  return {
    category: jobError?.category ?? 'execution',
    message: jobError?.message ?? 'ComfyUI execution failed.',
    ...(code === undefined ? {} : { code }),
    ...(remoteMayContinue ? { details: { remoteMayContinue: true } } : {}),
  };
}

function runningTaskForRetry(task: TaskRecord, now: string): TaskRecord {
  const running: TaskRecord = {
    schemaVersion: task.schemaVersion,
    taskId: task.taskId,
    status: 'running',
    operation: task.operation,
    prompt: task.prompt,
    attachments: task.attachments,
    outputs: [],
    placement: task.placement,
    ...(task.execution === undefined ? {} : { execution: task.execution }),
    createdAt: task.createdAt,
    updatedAt: now,
  };
  assertTaskRecord(running);
  return running;
}

function retryAllowed(input: RetryGenerationInput): boolean {
  const details = isRecord(input.latestJob.error?.details) ? input.latestJob.error.details : undefined;
  return input.task.status === 'failed'
    && input.latestJob.status === 'failed'
    && input.task.latestJobId === input.latestJob.id
    && details?.retryDisposition === 'same-task-new-job'
    && (details.stage === 'prepare' || details.stage === 'upload');
}

/** 创建 Application-owned ComfyUI GenerationBackend。 */
export function createComfyUiGenerationBackend(
  dependencies: ComfyUiGenerationBackendDependencies,
): GenerationBackend {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const backend: GenerationBackend = {
    id: COMFYUI_GENERATION_BACKEND_ID,

    async admit(command): Promise<AdmittedGeneration> {
      const normalizedCommand = normalizeGenerationCommand(command);
      if (normalizedCommand.backendId !== COMFYUI_GENERATION_BACKEND_ID) {
        throw createValidationError('ComfyUI GenerationBackend received a command for another backend.');
      }
      const payload = generationPayload(normalizedCommand);
      const workflow = await dependencies.workflows.get(payload.workflowId);
      if (!workflow) {
        throw createValidationError('ComfyUI workflow was not found.', { workflowId: payload.workflowId });
      }
      const connection = await dependencies.connections.get(workflow.connectionId);
      if (!connection) {
        throw createValidationError('ComfyUI connection was not found.', { connectionId: workflow.connectionId });
      }
      const contract = validateCanonicalComfyUiWorkflowContract(workflow.contract);
      assertComfyUiImageOnlyWorkflow(contract);
      if (workflow.source.kind === 'api-graph') {
        validateComfyUiApiGraphTargets(workflow.source.graph, contract);
      }
      assertContractInputs(contract, payload);
      const prompt = nonEmptyString(payload.prompt, 'ComfyUiGenerationPayload.prompt');
      const runningTask = runningTaskForAdmission({
        command: normalizedCommand,
        payload,
        connection,
        workflow,
        contract,
        prompt,
      });
      const request = executionRequest({
        connection,
        workflow,
        contract,
        prompt,
        images: payload.images,
        ...(payload.mask === undefined ? {} : { mask: payload.mask }),
      });
      const admitted: AdmittedGeneration = {
        taskId: normalizedCommand.taskId,
        backendId: COMFYUI_GENERATION_BACKEND_ID,
        execution: {
          workflow: COMFYUI_GENERATION_WORKFLOW,
          input: { request },
        },
        runningTask,
        lane: {
          key: `${COMFYUI_GENERATION_BACKEND_ID}:${connection.connectionId}`,
          maxConcurrency: COMFYUI_CONNECTION_LANE_MAX_CONCURRENCY,
        },
        retry: { allowed: true },
      };
      return normalizeAdmittedGeneration(normalizedCommand, backend.id, admitted);
    },

    async checkReadiness(submission): Promise<ReadinessDecision> {
      const request = comfyUiExecutionInput(submission);
      const workflow = await dependencies.workflows.get(request.source.workflowId);
      if (!workflow || workflow.connectionId !== request.connection.connectionId || workflow.source.kind !== request.source.kind) {
        return {
          status: 'reject',
          error: createValidationError('ComfyUI workflow changed or was deleted after admission.'),
        };
      }
      const connection = await dependencies.connections.get(request.connection.connectionId);
      if (!connection || connection.origin !== request.connection.origin) {
        return {
          status: 'reject',
          error: createValidationError('ComfyUI connection changed or was deleted after admission.'),
        };
      }
      const contract = validateCanonicalComfyUiWorkflowContract(workflow.contract);
      if (hasComfyUiMaskEntry(contract)) {
        return {
          status: 'reject',
          error: createComfyUiWorkflowNotReadyError(),
        };
      }
      if (workflow.source.kind === 'api-graph') {
        validateComfyUiApiGraphTargets(workflow.source.graph, contract);
      }
      return readinessFor(connection, workflow);
    },

    async projectTerminal(input): Promise<TaskRecord> {
      if (input.job.status !== 'completed' && input.job.status !== 'failed') {
        throw createValidationError('ComfyUI terminal projection requires a terminal Job.');
      }
      if (input.runningTask.taskId !== input.admitted.taskId || input.runningTask.latestJobId !== input.job.id) {
        throw createValidationError('ComfyUI terminal projection Task/Job correlation is invalid.');
      }
      const base = {
        ...input.runningTask,
        latestJobId: input.job.id,
        updatedAt: input.job.updatedAt,
        finishedAt: input.job.updatedAt,
      };
      const projected: TaskRecord = input.job.status === 'completed'
        ? {
            ...base,
            status: 'completed',
            outputs: outputsForTask(input.runningTask.taskId, validateComfyUiExecutionResult(input.job.output?.comfyui)),
          }
        : {
            ...base,
            status: 'failed',
            outputs: [],
            error: boundedTaskError(input.job.error),
          };
      assertTaskRecord(projected);
      return createImmutableSnapshot(projected) as TaskRecord;
    },

    async retry(input: RetryGenerationInput): Promise<AdmittedGeneration> {
      if (!retryAllowed(input)) {
        throw createValidationError('ComfyUI Retry is allowed only for deterministic pre-submission failure.');
      }
      const request = input.latestJob.input.request;
      if (!isRecord(request) || !isRecord(request.source) || typeof request.source.workflowId !== 'string') {
        throw createValidationError('ComfyUI Retry input is invalid.');
      }
      const typed = request as unknown as ComfyUiExecutionRequest;
      return backend.admit({
        taskId: input.task.taskId,
        backendId: COMFYUI_GENERATION_BACKEND_ID,
        payload: {
          workflowId: typed.source.workflowId,
          prompt: typed.prompt,
          images: typed.images,
          ...(typed.mask === undefined ? {} : { mask: typed.mask }),
          runningTask: runningTaskForRetry(input.task, now()),
        },
      });
    },
  };
  return backend;
}

import {
  createImmutableSnapshot,
  createValidationError,
  type Job,
  type StoredAssetRef,
} from '@imagen-ps/core-engine';
import {
  resolveMaskExecutionPlan,
  type ProviderOperation,
  type ProviderOutputOptions,
  type ProviderRegistry,
  type ProviderRequest,
  type FixedGenerationRequest,
  type ProviderId,
} from '@imagen-ps/providers';
import type { createFixedProviderResolver } from './fixed-provider-resolution.js';
import {
  assertTaskRecord,
  type TaskOutput,
  type TaskRecord,
} from '../task.js';
import {
  normalizeAdmittedGeneration,
  normalizeGenerationCommand,
} from './admission.js';
import type {
  AdmittedGeneration,
  GenerationBackend,
  GenerationCommand,
  ReadinessDecision,
  RetryGenerationInput,
  TerminalFollowUpInput,
  TerminalProjectionInput,
} from './types.js';

/** Provider generation policy 的稳定 backend id。 */
export const PROVIDER_GENERATION_BACKEND_ID = 'provider';

/** Provider lane 的固定并发上限。 */
export const PROVIDER_LANE_MAX_CONCURRENCY = 2;

/** Provider generation 支持的 canonical operation。 */
export type ProviderGenerationOperation = Extract<ProviderOperation, 'text_to_image' | 'image_edit'>;

/** Provider GenerationBackend 独占解释的 admission payload。 */
export interface ProviderGenerationPayload {
  /** 固定 provider identity。 */
  readonly providerId: 'grsai' | 'runninghub';

  /** 本次用户意图对应的 Provider operation。 */
  readonly operation: ProviderGenerationOperation;

  /** 尚未注入 resolved model/output 的 request facts。 */
  readonly request: Readonly<Record<string, unknown>>;

  /** UI/Application 已建立的同 taskId v2 running snapshot。 */
  readonly runningTask: TaskRecord;
}

/** Provider workflow 交给 stable execution adapter 的唯一 input shape。 */
export interface ProviderExecutionInput {
  /** Admission 已选择的 exact Provider implementation id。 */
  readonly implementationId: string;

  /** Dispatch-time account/provider identity。 */
  readonly providerId: 'grsai' | 'runninghub';

  /** Admission 已构造的 canonical Provider request。 */
  readonly request: ProviderRequest;
}

/** Admission request preparation hook 的 bounded 输入。 */
export interface ProviderAdmissionRequestPreparationInput {
  /** 已冻结的 GenerationCommand。 */
  readonly command: GenerationCommand;

  /** Admission 时读取的固定 provider identity。 */
  readonly providerId: 'grsai' | 'runninghub';

  /** 本次 Provider operation。 */
  readonly operation: ProviderGenerationOperation;

  /** Backend payload 中的 caller-owned request facts。 */
  readonly request: Readonly<Record<string, unknown>>;
}

/** Terminal Provider output materialization hook 的 bounded 输入。 */
export interface ProviderTerminalOutputMaterializationInput extends TerminalProjectionInput {
  /** Admission 固定的 exact Provider implementation id。 */
  readonly implementationId: string;

  /** Admission 固定的 provider identity。 */
  readonly providerId: 'grsai' | 'runninghub';
}

/** Terminal Task projector hook 的 bounded 输入。 */
export interface ProviderTerminalTaskProjectionInput extends ProviderTerminalOutputMaterializationInput {
  /** 已 materialize 的 durable output refs。 */
  readonly outputRefs: readonly StoredAssetRef[];
}

/** Provider terminal follow-up hook 的 bounded 输入。 */
export interface ProviderTerminalPolicyFollowUpInput extends TerminalFollowUpInput {
  /** Admission 固定的 exact Provider implementation id。 */
  readonly implementationId: string;

  /** Admission 固定的 provider identity。 */
  readonly providerId: 'grsai' | 'runninghub';
}

/** Provider GenerationBackend 的 injected owner dependencies。 */
export interface ProviderGenerationBackendDependencies {
  /** 固定 provider 的 catalog/account admission resolver。 */
  readonly fixedProviderResolver?: ReturnType<typeof createFixedProviderResolver>;
  /** Exact implementation lookup registry。 */
  readonly providerRegistry: Pick<ProviderRegistry, 'get'>;

  /** 可选 admission request preparation；只允许返回 durable refs，不得返回 bytes。 */
  readonly prepareRequest?: (
    input: ProviderAdmissionRequestPreparationInput,
  ) => Promise<Readonly<Record<string, unknown>>>;

  /** Provider terminal result 到 durable StoredAssetRef 的 materializer。 */
  readonly materializeOutput: (
    input: ProviderTerminalOutputMaterializationInput,
  ) => Promise<readonly StoredAssetRef[]>;

  /** 可选 terminal Task projector；未提供时使用 backend-neutral 默认投影。 */
  readonly projectTerminal?: (
    input: ProviderTerminalTaskProjectionInput,
  ) => Promise<TaskRecord>;

  /** Terminal Task 持久化后的 billing/refresh follow-up owner。 */
  readonly afterTerminal: (
    input: ProviderTerminalPolicyFollowUpInput,
  ) => Promise<void>;

  /** Retry snapshot 时间来源；默认使用当前时间。 */
  readonly now?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw createValidationError(`${path} must be a record.`, { path });
  }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createValidationError(`${path} must be a non-empty string.`, { path });
  }
}

function providerPayload(command: GenerationCommand): ProviderGenerationPayload {
  assertRecord(command.payload, 'ProviderGenerationPayload');
  const payload = command.payload;
  const allowed = new Set(['providerId', 'operation', 'request', 'runningTask']);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw createValidationError(`ProviderGenerationPayload contains unsupported field "${key}".`, {
        path: `payload.${key}`,
      });
    }
  }
  if (payload.providerId !== 'grsai' && payload.providerId !== 'runninghub') {
    throw createValidationError('ProviderGenerationPayload.providerId must be grsai or runninghub.');
  }
  if (payload.operation !== 'text_to_image' && payload.operation !== 'image_edit') {
    throw createValidationError('ProviderGenerationPayload.operation must be text_to_image or image_edit.');
  }
  assertRecord(payload.request, 'ProviderGenerationPayload.request');
  assertTaskRecord(payload.runningTask);
  return payload as unknown as ProviderGenerationPayload;
}

function explicitConfigModelId(
  request: Readonly<Record<string, unknown>>,
  runningTask: TaskRecord,
): string | undefined {
  const providerOptions = isRecord(request.providerOptions) ? request.providerOptions : undefined;
  if (typeof providerOptions?.model === 'string' && providerOptions.model.trim().length > 0) {
    return providerOptions.model.trim();
  }
  const targetId = runningTask.execution?.target?.id;
  return typeof targetId === 'string' && targetId.trim().length > 0 ? targetId.trim() : undefined;
}

function providerOptionsWithoutModel(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { model: _model, ...rest } = value;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function assertStoredAssetRef(value: unknown, path: string): asserts value is StoredAssetRef {
  assertRecord(value, path);
  if (
    value.kind !== 'inline'
    && value.kind !== 'url'
    && value.kind !== 'hostObject'
    && value.kind !== 'externalToken'
  ) {
    throw createValidationError(`${path}.kind is invalid.`, { path: `${path}.kind` });
  }
  assertNonEmptyString(value.ref, `${path}.ref`);
}

function assertPreparedAsset(value: unknown, path: string): void {
  assertRecord(value, path);
  if (value.data !== undefined || value.url !== undefined || value.fileId !== undefined) {
    throw createValidationError(`${path} must contain only a prepared StoredAssetRef.`, { path });
  }
  assertStoredAssetRef(value.storedRef, `${path}.storedRef`);
}

function assertPreparedCanonicalMask(value: unknown): void {
  assertRecord(value, 'request.maskImage');
  const allowed = ['asset', 'targetAttachmentId', 'dimensions', 'encoding', 'bitDepth', 'polarity'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw createValidationError('request.maskImage contains unsupported field.');
  assertPreparedAsset(value.asset, 'request.maskImage.asset');
  assertNonEmptyString(value.targetAttachmentId, 'request.maskImage.targetAttachmentId');
  assertRecord(value.dimensions, 'request.maskImage.dimensions');
  if (!Number.isSafeInteger(value.dimensions.width) || !Number.isSafeInteger(value.dimensions.height) || Number(value.dimensions.width) < 1 || Number(value.dimensions.height) < 1) {
    throw createValidationError('request.maskImage.dimensions is invalid.');
  }
  if (value.encoding !== 'grayscale-png' || value.bitDepth !== 8 || value.polarity !== 'white-edit') {
    throw createValidationError('request.maskImage canonical semantics are invalid.');
  }
}

function assertPreparedInputs(
  operation: ProviderGenerationOperation,
  request: Readonly<Record<string, unknown>>,
): void {
  if (operation === 'image_edit') {
    if (!Array.isArray(request.images) || request.images.length === 0) {
      throw createValidationError('Provider image_edit admission requires prepared images.');
    }
    request.images.forEach((asset, index) => assertPreparedAsset(asset, `request.images[${index}]`));
  } else if (request.images !== undefined || request.maskImage !== undefined) {
    throw createValidationError('Provider text_to_image admission must not include images or maskImage.');
  }
  if (request.maskImage !== undefined) {
    const mask = request.maskImage;
    assertPreparedCanonicalMask(mask);
    if (request.primaryAttachmentId !== (mask as { readonly targetAttachmentId: string }).targetAttachmentId) {
      throw createValidationError('Provider Mask must target request primaryAttachmentId.');
    }
    assertRecord(request.inputContext, 'request.inputContext');
    assertRecord(request.inputContext.primaryEditInput, 'request.inputContext.primaryEditInput');
    const dimensions = (mask as { readonly dimensions: { readonly width: number; readonly height: number } }).dimensions;
    if (
      request.inputContext.primaryEditInput.width !== dimensions.width
      || request.inputContext.primaryEditInput.height !== dimensions.height
    ) {
      throw createValidationError('Provider Mask must match request.inputContext.primaryEditInput dimensions.');
    }
  }
}

function canonicalRequest(args: {
  readonly operation: ProviderGenerationOperation;
  readonly prepared: Readonly<Record<string, unknown>>;
  readonly modelId: string;
  readonly providerId: ProviderId;
  readonly output: ProviderOutputOptions;
}): ProviderRequest {
  const { prepared } = args;
  const userPrompt = typeof prepared.userPrompt === 'string' ? prepared.userPrompt : prepared.prompt;
  assertNonEmptyString(userPrompt, 'Provider request.userPrompt');
  if (prepared.output !== undefined && !isRecord(prepared.output)) {
    throw createValidationError('Provider request.output must be a record.');
  }
  if (prepared.inputContext !== undefined && !isRecord(prepared.inputContext)) {
    throw createValidationError('Provider request.inputContext must be a record.');
  }
  const providerOptions = providerOptionsWithoutModel(prepared.providerOptions);
  const maskExecutionPlan = resolveMaskExecutionPlan({
    providerId: args.providerId === 'grsai' ? 'grsai' : 'openai',
    capabilityModelId: args.modelId,
    hasReadyMask: prepared.maskImage !== undefined,
  });
  const admitsMask = maskExecutionPlan.kind === 'provider-native';
  return {
    operation: args.operation,
    prompt: userPrompt,
    userPrompt,
    ...(typeof prepared.systemPrompt === 'string' ? { systemPrompt: prepared.systemPrompt } : {}),
    ...(prepared.providerId === 'grsai' || prepared.providerId === 'runninghub' ? { providerId: prepared.providerId } : {}),
    ...(typeof prepared.modelId === 'string' ? { modelId: prepared.modelId } : {}),
    ...(isRecord(prepared.parameters) && Object.values(prepared.parameters).every((value) => typeof value === 'string')
      ? { parameters: prepared.parameters as Readonly<Record<string, string>> }
      : {}),
    ...(Array.isArray(prepared.images) ? { images: prepared.images as ProviderRequest['images'] } : {}),
    ...(typeof prepared.primaryAttachmentId === 'string'
      ? { primaryAttachmentId: prepared.primaryAttachmentId }
      : {}),
    ...(admitsMask ? { maskImage: prepared.maskImage as ProviderRequest['maskImage'] } : {}),
    ...(prepared.maskImage !== undefined ? { maskExecutionPlan } : {}),
    output: {
      ...(prepared.output ?? {}),
      ...args.output,
    },
    ...(prepared.inputContext !== undefined
      ? { inputContext: prepared.inputContext as ProviderRequest['inputContext'] }
      : {}),
    ...(providerOptions !== undefined ? { providerOptions } : {}),
  };
}

function operationForTask(operation: ProviderGenerationOperation): TaskRecord['operation'] {
  return operation === 'image_edit' ? 'image-edit' : 'text-to-image';
}

function runningTaskForAdmission(args: {
  readonly command: GenerationCommand;
  readonly payload: ProviderGenerationPayload;
  readonly providerId: 'grsai' | 'runninghub';
  readonly configModelId: string;
  readonly prompt: string;
}): TaskRecord {
  const source = args.payload.runningTask;
  if (source.taskId !== args.command.taskId || source.status !== 'running') {
    throw createValidationError('Provider running Task must match command taskId and have status "running".', {
      commandTaskId: args.command.taskId,
      runningTaskId: source.taskId,
      status: source.status,
    });
  }
  if (source.latestJobId !== undefined) {
    throw createValidationError('Provider running Task must not have latestJobId before Job creation.', {
      taskId: source.taskId,
    });
  }
  if (source.operation !== operationForTask(args.payload.operation) || source.prompt !== args.prompt) {
    throw createValidationError('Provider running Task does not match admitted operation/prompt.', {
      taskId: source.taskId,
    });
  }

  const task: TaskRecord = {
    ...source,
    execution: {
      backend: { id: PROVIDER_GENERATION_BACKEND_ID, label: 'Provider' },
      connection: { id: args.providerId, label: args.providerId === 'grsai' ? 'GRSAI' : 'RunningHub' },
      target: {
        id: args.configModelId,
        label: source.execution?.target?.id === args.configModelId
          ? source.execution.target.label
          : args.configModelId,
      },
    },
  };
  assertTaskRecord(task);
  return task;
}

function executionInput(admitted: AdmittedGeneration): ProviderExecutionInput {
  if (admitted.backendId !== PROVIDER_GENERATION_BACKEND_ID) {
    throw createValidationError('Provider backend received an admission owned by another backend.', {
      backendId: admitted.backendId,
    });
  }
  const input = admitted.execution.input;
  assertRecord(input, 'ProviderExecutionInput');
  const allowed = new Set(['implementationId', 'providerId', 'request']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw createValidationError(`ProviderExecutionInput contains unsupported field "${key}".`, {
        path: `execution.input.${key}`,
      });
    }
  }
  assertNonEmptyString(input.implementationId, 'ProviderExecutionInput.implementationId');
  if (input.providerId !== 'grsai' && input.providerId !== 'runninghub') throw createValidationError('ProviderExecutionInput.providerId is invalid.');
  assertRecord(input.request, 'ProviderExecutionInput.request');
  return input as unknown as ProviderExecutionInput;
}

/** 从 admitted execution 中读取已验证的 Provider bridge input。 */
export function providerExecutionInput(admitted: AdmittedGeneration): ProviderExecutionInput {
  return executionInput(admitted);
}

function outputsForTask(taskId: string, refs: readonly StoredAssetRef[]): readonly TaskOutput[] {
  return refs.map((ref, index) => ({
    outputId: `${taskId}:output:${index}`,
    index,
    kind: 'image',
    asset: { ref },
  }));
}

function taskUsageFromJob(job: Job): TaskRecord['taskUsage'] {
  const output = job.output;
  if (!isRecord(output) || !isRecord(output.image) || !isRecord(output.image.taskUsage) || !Array.isArray(output.image.taskUsage.metrics)) return undefined;
  const metrics = output.image.taskUsage.metrics.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.value !== 'string' || typeof item.unit !== 'string') return [];
    if (!['runninghub-coins', 'runninghub-money', 'runninghub-third-party-money', 'grsai-balance-change'].includes(item.id)) return [];
    if (!['coins', 'money', 'credits'].includes(item.unit) || !Number.isFinite(Number(item.value))) return [];
    return [{ id: item.id as 'runninghub-coins' | 'runninghub-money' | 'runninghub-third-party-money' | 'grsai-balance-change', value: item.value, unit: item.unit as 'coins' | 'money' | 'credits' }];
  });
  return metrics.length ? { metrics } : undefined;
}

function defaultTerminalProjection(input: ProviderTerminalTaskProjectionInput): TaskRecord {
  const { job, runningTask } = input;
  const taskUsage = job.status === 'completed' ? taskUsageFromJob(job) : undefined;
  const base = {
    ...runningTask,
    latestJobId: job.id,
    updatedAt: job.updatedAt,
    finishedAt: job.updatedAt,
    ...(taskUsage ? { taskUsage } : {}),
  };
  return job.status === 'completed'
    ? {
        ...base,
        status: 'completed',
        outputs: outputsForTask(runningTask.taskId, input.outputRefs),
      }
    : {
        ...base,
        status: 'failed',
        outputs: [],
        error: {
          category: job.error?.category ?? 'runtime',
          message: job.error?.message ?? 'Provider execution failed.',
        },
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
    ...(task.editRegion === undefined ? {} : { editRegion: task.editRegion }),
    placement: task.placement,
    ...(task.execution !== undefined ? { execution: task.execution } : {}),
    createdAt: task.createdAt,
    updatedAt: now,
  };
  assertTaskRecord(running);
  return running;
}

/** 创建 concrete Provider GenerationBackend policy owner。 */
export function createProviderGenerationBackend(
  dependencies: ProviderGenerationBackendDependencies,
): GenerationBackend {
  const now = dependencies.now ?? (() => new Date().toISOString());

  const backend: GenerationBackend = {
    id: PROVIDER_GENERATION_BACKEND_ID,

    async admit(command): Promise<AdmittedGeneration> {
      const normalizedCommand = normalizeGenerationCommand(command);
      if (normalizedCommand.backendId !== PROVIDER_GENERATION_BACKEND_ID) {
        throw createValidationError('Provider GenerationBackend received a command for another backend.', {
          backendId: normalizedCommand.backendId,
        });
      }
      const payload = providerPayload(normalizedCommand);
      const provider = dependencies.providerRegistry.get(payload.providerId === 'grsai' ? 'grsai' : 'runninghub');
      if (!provider) throw createValidationError('Fixed provider implementation is not registered.', { providerId: payload.providerId });
      if (!provider.describe().operations.includes(payload.operation)) throw createValidationError('Provider implementation does not support requested operation.');
      let prepared = dependencies.prepareRequest ? await dependencies.prepareRequest({ command: normalizedCommand, providerId: payload.providerId, operation: payload.operation, request: payload.request }) : payload.request;
      assertRecord(prepared, 'Prepared Provider request'); assertPreparedInputs(payload.operation, prepared);
      const modelId = typeof prepared.modelId === 'string' && prepared.modelId.trim() ? prepared.modelId.trim() : explicitConfigModelId(prepared, payload.runningTask);
      if (!modelId) throw createValidationError('Fixed provider admission requires modelId.');
      if (!dependencies.fixedProviderResolver) throw createValidationError('Fixed provider resolver is unavailable.');
      const fixedUserPrompt = String(prepared.userPrompt ?? prepared.prompt ?? '');
      const fixedResolved = await dependencies.fixedProviderResolver.resolveGeneration({ providerId: payload.providerId, modelId, operation: payload.operation, prompt: fixedUserPrompt, userPrompt: fixedUserPrompt, ...(typeof prepared.systemPrompt === 'string' ? { systemPrompt: prepared.systemPrompt } : {}), ...(Array.isArray(prepared.images) ? { images: prepared.images as FixedGenerationRequest['images'] } : {}), ...(prepared.maskImage ? { maskImage: prepared.maskImage as FixedGenerationRequest['maskImage'] } : {}), parameters: isRecord(prepared.parameters) && Object.values(prepared.parameters).every((value) => typeof value === 'string') ? prepared.parameters as Readonly<Record<string, string>> : {} });
      prepared = { ...prepared, providerId: payload.providerId, modelId: fixedResolved.request.modelId, parameters: fixedResolved.request.parameters };
      const providerId: ProviderId = payload.providerId;
      const request = canonicalRequest({ operation: payload.operation, prepared, modelId: fixedResolved.request.modelId, providerId, output: {} });
      const runningTask = runningTaskForAdmission({ command: normalizedCommand, payload, providerId: payload.providerId, configModelId: fixedResolved.request.modelId, prompt: request.prompt });
      return normalizeAdmittedGeneration(normalizedCommand, backend.id, { taskId: normalizedCommand.taskId, backendId: PROVIDER_GENERATION_BACKEND_ID, execution: { workflow: payload.operation === 'image_edit' ? 'provider-edit' : 'provider-generate', input: { implementationId: provider.id, providerId: payload.providerId, request } }, runningTask, lane: { key: 'provider:' + payload.providerId, maxConcurrency: PROVIDER_LANE_MAX_CONCURRENCY }, retry: { allowed: true } });
    },

    async checkReadiness(submission): Promise<ReadinessDecision> {
      const input = executionInput(submission);
      if (!input.providerId) return { status: 'reject', error: createValidationError('Provider ID is missing.') };
      const provider = dependencies.providerRegistry.get(input.implementationId);
      if (!provider || provider.id !== input.implementationId) {
        return {
          status: 'reject',
          error: createValidationError(`Provider implementation "${input.implementationId}" is not registered.`, {
            implementationId: input.implementationId,
          }),
        };
      }
      return { status: 'ready' };
    },

    async projectTerminal(input: TerminalProjectionInput): Promise<TaskRecord> {
      if (input.job.status !== 'completed' && input.job.status !== 'failed') {
        throw createValidationError('Provider terminal projection requires a terminal Job.', {
          jobId: input.job.id,
          status: input.job.status,
        });
      }
      if (input.runningTask.taskId !== input.admitted.taskId || input.runningTask.latestJobId !== input.job.id) {
        throw createValidationError('Provider terminal projection Task/Job correlation is invalid.', {
          taskId: input.runningTask.taskId,
          jobId: input.job.id,
        });
      }
      const providerInput = executionInput(input.admitted);
      const materializationInput: ProviderTerminalOutputMaterializationInput = {
        ...input,
        implementationId: providerInput.implementationId,
        providerId: providerInput.providerId,
      };
      const outputRefs = input.job.status === 'completed'
        ? await dependencies.materializeOutput(materializationInput)
        : [];
      const projectionInput: ProviderTerminalTaskProjectionInput = {
        ...materializationInput,
        outputRefs,
      };
      const projected = dependencies.projectTerminal
        ? await dependencies.projectTerminal(projectionInput)
        : defaultTerminalProjection(projectionInput);
      assertTaskRecord(projected);
      if (
        projected.taskId !== input.admitted.taskId
        || projected.latestJobId !== input.job.id
        || projected.status !== input.job.status
      ) {
        throw createValidationError('Provider terminal projector returned an inconsistent Task snapshot.', {
          taskId: projected.taskId,
          jobId: input.job.id,
          taskStatus: projected.status,
          jobStatus: input.job.status,
        });
      }
      return createImmutableSnapshot(projected) as TaskRecord;
    },

    async retry(input: RetryGenerationInput): Promise<AdmittedGeneration> {
      if (input.task.status !== 'failed' || input.latestJob.status !== 'failed') {
        throw createValidationError('Provider Retry requires a failed Task and failed latest Job.', {
          taskId: input.task.taskId,
          jobId: input.latestJob.id,
        });
      }
      if (input.task.latestJobId !== input.latestJob.id) {
        throw createValidationError('Provider Retry latest Job does not match Task.latestJobId.', {
          taskId: input.task.taskId,
          taskLatestJobId: input.task.latestJobId,
          jobId: input.latestJob.id,
        });
      }
      const latestInput = input.latestJob.input;
      assertRecord(latestInput.request, 'Provider retry Job input.request');
      if (latestInput.providerId !== 'grsai' && latestInput.providerId !== 'runninghub') throw createValidationError('Provider retry Job input.providerId is invalid.');
      const canonical = latestInput.request;
      const providerOptions = {
        ...(isRecord(canonical.providerOptions) ? canonical.providerOptions : {}),
        ...(input.task.execution?.target?.id
          ? { model: input.task.execution.target.id }
          : {}),
      };
      const retryRequest: Record<string, unknown> = {
        ...canonical,
        providerOptions,
      };
      delete retryRequest.model;
      delete retryRequest.capabilityModelId;
      if (input.task.editRegion === undefined) {
        delete retryRequest.maskImage;
      } else {
        const primaryAttachmentId = input.task.attachments[0]?.attachmentId;
        if (primaryAttachmentId !== input.task.editRegion.targetAttachmentId) {
          throw createValidationError('Provider retry Mask must target the original primary attachment.');
        }
        retryRequest.primaryAttachmentId = primaryAttachmentId;
        retryRequest.maskImage = {
          asset: { type: 'image', storedRef: input.task.editRegion.mask.ref },
          targetAttachmentId: input.task.editRegion.targetAttachmentId,
          dimensions: {
            width: input.task.editRegion.geometry.targetWidth,
            height: input.task.editRegion.geometry.targetHeight,
          },
          encoding: input.task.editRegion.encoding,
          bitDepth: input.task.editRegion.bitDepth,
          polarity: input.task.editRegion.polarity,
        };
      }
      return backend.admit({
        taskId: input.task.taskId,
        backendId: PROVIDER_GENERATION_BACKEND_ID,
        payload: {
          providerId: latestInput.providerId,
          operation: input.task.operation === 'image-edit' ? 'image_edit' : 'text_to_image',
          request: retryRequest,
          runningTask: runningTaskForRetry(input.task, now()),
        },
      });
    },

    async afterTerminal(input: TerminalFollowUpInput): Promise<void> {
      if (
        (input.job.status !== 'completed' && input.job.status !== 'failed')
        || input.task.status !== input.job.status
        || input.task.taskId !== input.admitted.taskId
        || input.task.latestJobId !== input.job.id
      ) {
        throw createValidationError('Provider terminal follow-up requires a matching terminal Job/Task.', {
          taskId: input.task.taskId,
          jobId: input.job.id,
        });
      }
      const providerInput = executionInput(input.admitted);
      await dependencies.afterTerminal({
        ...input,
        implementationId: providerInput.implementationId,
        providerId: providerInput.providerId,
      });
    },
  };

  return backend;
}

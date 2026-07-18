import {
  createImmutableSnapshot,
  createValidationError,
  type StoredAssetRef,
} from '@imagen-ps/core-engine';
import {
  implementationIdForApiFormat,
  type ProviderOperation,
  type ProviderOutputOptions,
  type ProviderRegistry,
  type ProviderRequest,
} from '@imagen-ps/providers';
import { resolveConfiguredModel, toProviderModelExecution } from '../commands/model-config-resolution.js';
import { resolveModelGenerationSettingsValue } from '../commands/model-generation-preference-resolution.js';
import type {
  ModelGenerationPreferenceRepository,
  ProviderProfile,
  ProviderProfileRepository,
  UserModelConfigRepository,
} from '../commands/types.js';
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

/** Provider profile lane 的固定并发上限。 */
export const PROVIDER_PROFILE_LANE_MAX_CONCURRENCY = 2;

/** Provider generation 支持的 canonical operation。 */
export type ProviderGenerationOperation = Extract<ProviderOperation, 'text_to_image' | 'image_edit'>;

/** Provider GenerationBackend 独占解释的 admission payload。 */
export interface ProviderGenerationPayload {
  /** Non-secret profile reference。 */
  readonly profileId: string;

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

  /** Dispatch-time config resolver 使用的 non-secret profile ref。 */
  readonly profileId: string;

  /** Admission 已构造的 canonical Provider request。 */
  readonly request: ProviderRequest;
}

/** Admission request preparation hook 的 bounded 输入。 */
export interface ProviderAdmissionRequestPreparationInput {
  /** 已冻结的 GenerationCommand。 */
  readonly command: GenerationCommand;

  /** Admission 时读取的 sanitized profile。 */
  readonly profile: ProviderProfile;

  /** 本次 Provider operation。 */
  readonly operation: ProviderGenerationOperation;

  /** Backend payload 中的 caller-owned request facts。 */
  readonly request: Readonly<Record<string, unknown>>;
}

/** Terminal Provider output materialization hook 的 bounded 输入。 */
export interface ProviderTerminalOutputMaterializationInput extends TerminalProjectionInput {
  /** Admission 固定的 exact Provider implementation id。 */
  readonly implementationId: string;

  /** Admission 固定的 non-secret profile ref。 */
  readonly profileId: string;
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

  /** Admission 固定的 non-secret profile ref。 */
  readonly profileId: string;
}

/** Provider GenerationBackend 的 injected owner dependencies。 */
export interface ProviderGenerationBackendDependencies {
  /** Sanitized Provider profile repository。 */
  readonly profileRepository: Pick<ProviderProfileRepository, 'get'>;

  /** Exact implementation lookup registry。 */
  readonly providerRegistry: Pick<ProviderRegistry, 'get'>;

  /** Profile-owned model config repository。 */
  readonly userModelConfigRepository: Pick<UserModelConfigRepository, 'get' | 'list'>;

  /** Model-scoped output preference repository。 */
  readonly modelGenerationPreferenceRepository: Pick<ModelGenerationPreferenceRepository, 'get'>;

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
  const allowed = new Set(['profileId', 'operation', 'request', 'runningTask']);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw createValidationError(`ProviderGenerationPayload contains unsupported field "${key}".`, {
        path: `payload.${key}`,
      });
    }
  }
  assertNonEmptyString(payload.profileId, 'ProviderGenerationPayload.profileId');
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
    assertPreparedAsset(request.maskImage, 'request.maskImage');
  }
}

function canonicalRequest(args: {
  readonly operation: ProviderGenerationOperation;
  readonly prepared: Readonly<Record<string, unknown>>;
  readonly model: ReturnType<typeof toProviderModelExecution>;
  readonly capabilityModelId: string;
  readonly output: ProviderOutputOptions;
}): ProviderRequest {
  const { prepared } = args;
  assertNonEmptyString(prepared.prompt, 'Provider request.prompt');
  if (prepared.output !== undefined && !isRecord(prepared.output)) {
    throw createValidationError('Provider request.output must be a record.');
  }
  if (prepared.inputContext !== undefined && !isRecord(prepared.inputContext)) {
    throw createValidationError('Provider request.inputContext must be a record.');
  }
  const providerOptions = providerOptionsWithoutModel(prepared.providerOptions);
  return {
    operation: args.operation,
    prompt: prepared.prompt,
    ...(Array.isArray(prepared.images) ? { images: prepared.images as ProviderRequest['images'] } : {}),
    ...(prepared.maskImage !== undefined ? { maskImage: prepared.maskImage as ProviderRequest['maskImage'] } : {}),
    output: {
      ...(prepared.output ?? {}),
      ...args.output,
    },
    ...(prepared.inputContext !== undefined
      ? { inputContext: prepared.inputContext as ProviderRequest['inputContext'] }
      : {}),
    model: args.model,
    capabilityModelId: args.capabilityModelId,
    ...(providerOptions !== undefined ? { providerOptions } : {}),
  };
}

function operationForTask(operation: ProviderGenerationOperation): TaskRecord['operation'] {
  return operation === 'image_edit' ? 'image-edit' : 'text-to-image';
}

function runningTaskForAdmission(args: {
  readonly command: GenerationCommand;
  readonly payload: ProviderGenerationPayload;
  readonly profile: ProviderProfile;
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
      connection: { id: args.profile.profileId, label: args.profile.displayName },
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
  const allowed = new Set(['implementationId', 'profileId', 'request']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw createValidationError(`ProviderExecutionInput contains unsupported field "${key}".`, {
        path: `execution.input.${key}`,
      });
    }
  }
  assertNonEmptyString(input.implementationId, 'ProviderExecutionInput.implementationId');
  assertNonEmptyString(input.profileId, 'ProviderExecutionInput.profileId');
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

function defaultTerminalProjection(input: ProviderTerminalTaskProjectionInput): TaskRecord {
  const { job, runningTask } = input;
  const base = {
    ...runningTask,
    latestJobId: job.id,
    updatedAt: job.updatedAt,
    finishedAt: job.updatedAt,
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
      const profile = await dependencies.profileRepository.get(payload.profileId);
      if (!profile) {
        throw createValidationError(`Provider profile "${payload.profileId}" not found.`, {
          profileId: payload.profileId,
        });
      }
      if (!profile.enabled) {
        throw createValidationError(`Provider profile "${payload.profileId}" is disabled.`, {
          profileId: payload.profileId,
        });
      }

      const implementationId = implementationIdForApiFormat(profile.apiFormat);
      const provider = dependencies.providerRegistry.get(implementationId);
      if (!provider || provider.id !== implementationId) {
        throw createValidationError(`Provider implementation "${implementationId}" is not registered.`, {
          implementationId,
          profileId: profile.profileId,
        });
      }
      const descriptor = provider.describe();
      if (!descriptor.operations.includes(payload.operation)) {
        throw createValidationError(
          `Provider implementation "${implementationId}" does not support operation "${payload.operation}".`,
          { implementationId, operation: payload.operation },
        );
      }

      const prepared = dependencies.prepareRequest
        ? await dependencies.prepareRequest({
            command: normalizedCommand,
            profile,
            operation: payload.operation,
            request: payload.request,
          })
        : payload.request;
      assertRecord(prepared, 'Prepared Provider request');
      assertPreparedInputs(payload.operation, prepared);

      const configuredModelId = explicitConfigModelId(prepared, payload.runningTask)
        ?? (await dependencies.userModelConfigRepository.list(profile.profileId))[0]?.modelId;
      if (!configuredModelId) {
        throw createValidationError(`Provider profile "${profile.profileId}" has no configured model for admission.`, {
          profileId: profile.profileId,
        });
      }
      const resolvedModel = await resolveConfiguredModel({
        profileId: profile.profileId,
        apiFormat: profile.apiFormat,
        modelId: configuredModelId,
        userModelConfigRepository: dependencies.userModelConfigRepository,
      });
      const preferenceKey = {
        profileId: profile.profileId,
        apiFormat: profile.apiFormat,
        modelId: resolvedModel.configModelId,
        operation: payload.operation,
      } as const;
      const generationSettings = resolveModelGenerationSettingsValue({
        key: preferenceKey,
        preference: await dependencies.modelGenerationPreferenceRepository.get(preferenceKey),
        userConfig: resolvedModel.source === 'user' ? resolvedModel : undefined,
      });
      const request = canonicalRequest({
        operation: payload.operation,
        prepared,
        model: toProviderModelExecution(resolvedModel),
        capabilityModelId: resolvedModel.capabilityModelId,
        output: { selection: generationSettings.selection.effectiveSelection },
      });
      const runningTask = runningTaskForAdmission({
        command: normalizedCommand,
        payload,
        profile,
        configModelId: resolvedModel.configModelId,
        prompt: request.prompt,
      });
      const admitted: AdmittedGeneration = {
        taskId: normalizedCommand.taskId,
        backendId: PROVIDER_GENERATION_BACKEND_ID,
        execution: {
          workflow: payload.operation === 'image_edit' ? 'provider-edit' : 'provider-generate',
          input: {
            implementationId,
            profileId: profile.profileId,
            request,
          },
        },
        runningTask,
        lane: {
          key: `${PROVIDER_GENERATION_BACKEND_ID}:${profile.profileId}`,
          maxConcurrency: PROVIDER_PROFILE_LANE_MAX_CONCURRENCY,
        },
        retry: { allowed: true },
      };
      return normalizeAdmittedGeneration(normalizedCommand, backend.id, admitted);
    },

    async checkReadiness(submission): Promise<ReadinessDecision> {
      const input = executionInput(submission);
      const profile = await dependencies.profileRepository.get(input.profileId);
      if (!profile) {
        return {
          status: 'reject',
          error: createValidationError(`Provider profile "${input.profileId}" not found.`, {
            profileId: input.profileId,
          }),
        };
      }
      if (!profile.enabled) {
        return {
          status: 'wait',
          reason: createValidationError(`Provider profile "${input.profileId}" is disabled.`, {
            profileId: input.profileId,
          }),
        };
      }
      const currentImplementationId = implementationIdForApiFormat(profile.apiFormat);
      if (currentImplementationId !== input.implementationId) {
        return {
          status: 'reject',
          error: createValidationError('Provider profile API format changed after admission.', {
            profileId: input.profileId,
            admittedImplementationId: input.implementationId,
            currentImplementationId,
          }),
        };
      }
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
        profileId: providerInput.profileId,
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
      assertNonEmptyString(latestInput.profileId, 'Provider retry Job input.profileId');
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
      return backend.admit({
        taskId: input.task.taskId,
        backendId: PROVIDER_GENERATION_BACKEND_ID,
        payload: {
          profileId: latestInput.profileId,
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
        profileId: providerInput.profileId,
      });
    },
  };

  return backend;
}

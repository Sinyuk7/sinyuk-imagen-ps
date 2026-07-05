/**
 * Runtime 单例管理
 *
 * 本模块持有唯一的 Runtime 实例，仅 `commands/` 模块可以 import。
 * UI 层、host 层 MUST NOT 直接引用。
 */

import {
  assertNoSecrets,
  assertTaskRecord,
  createValidationError,
  createRuntime,
  sanitizeTaskEvidenceUrl,
  type DurableJobRecord,
  type Job,
  type JobError,
  type Runtime,
  type StoredAssetRef,
  type TaskExecutionSnapshot,
  type TaskOutput,
  type TaskRecord,
} from '@imagen-ps/core-engine';
import {
  createDispatchAdapter,
  createProviderRegistry,
  registerBuiltins,
  type ApiFormat,
  type ProviderModelExecution,
  type ProviderRegistry,
  type ProviderOperation,
} from '@imagen-ps/providers';
import type { LogSink, Logger } from '@imagen-ps/foundation';
import { createLogger, createNullLogger } from '@imagen-ps/foundation';
import type {
  AssetStore,
  JobHistoryStore,
  ModelDiscoveryCache,
  ModelDiscoveryCacheRepository,
  ModelGenerationPreference,
  ModelGenerationPreferenceKey,
  ModelGenerationPreferenceRepository,
  ProviderConfigResolver,
  ProviderProfile,
  ProviderProfileRepository,
  ResolvedProviderConfig,
  SecretStorageAdapter,
  TaskStore,
  UserModelConfig,
  UserModelConfigRepository,
} from './commands/types.js';
import { resolveConfiguredModel, toProviderModelExecution } from './commands/model-config-resolution.js';
import { resolveModelGenerationSettingsValue } from './commands/model-generation-preference-resolution.js';
import { resolveSecretValue } from './commands/secret-utils.js';
import { providerImplementationIdForApiFormat } from './commands/api-format-profile.js';
import { builtinWorkflows } from './requests/index.js';

/** 扩展的 Runtime 类型，暴露 provider registry 只读访问 */
export interface ExtendedRuntime extends Runtime {
  /** Provider registry 只读访问（与 Runtime.registry 的 WorkflowRegistry 不同） */
  readonly providerRegistry: Pick<ProviderRegistry, 'list' | 'get' | 'getByApiFormat'>;
}

let instance: ExtendedRuntime | null = null;
let registryInstance: ProviderRegistry | null = null;
let providerProfileRepositoryInstance: ProviderProfileRepository | null = null;
let modelDiscoveryCacheRepositoryInstance: ModelDiscoveryCacheRepository | null = null;
let userModelConfigRepositoryInstance: UserModelConfigRepository | null = null;
let modelGenerationPreferenceRepositoryInstance: ModelGenerationPreferenceRepository | null = null;
let secretStorageAdapterInstance: SecretStorageAdapter | null = null;
let providerConfigResolverInstance: ProviderConfigResolver | null = null;
let jobHistoryStoreInstance: JobHistoryStore | null = null;
let taskStoreInstance: TaskStore | null = null;
let assetStoreInstance: AssetStore | null = null;
let runtimeLogger: Logger | undefined = undefined;

function createInMemoryProviderProfileRepository(): ProviderProfileRepository {
  const store = new Map<string, ProviderProfile>();
  return {
    async list(): Promise<readonly ProviderProfile[]> {
      return Array.from(store.values());
    },
    async get(profileId: string): Promise<ProviderProfile | undefined> {
      return store.get(profileId);
    },
    async save(profile: ProviderProfile): Promise<void> {
      store.set(profile.profileId, profile);
    },
    async delete(profileId: string): Promise<void> {
      store.delete(profileId);
    },
  };
}

function createInMemoryModelDiscoveryCacheRepository(): ModelDiscoveryCacheRepository {
  const store = new Map<string, ModelDiscoveryCache>();
  return {
    async get(profileId) {
      return store.get(profileId);
    },
    async put(cache) {
      store.set(cache.profileId, cache);
    },
    async delete(profileId) {
      store.delete(profileId);
    },
  };
}

function userModelConfigKey(apiFormat: string, modelId: string): string {
  return `${apiFormat}:${modelId}`;
}

function modelGenerationPreferenceKey(key: ModelGenerationPreferenceKey): string {
  return `${key.profileId}:${key.apiFormat}:${key.modelId}:${key.operation}`;
}

function createInMemoryUserModelConfigRepository(): UserModelConfigRepository {
  const store = new Map<string, UserModelConfig>();
  return {
    async list(apiFormat) {
      const configs = Array.from(store.values()).filter((config): config is NonNullable<typeof config> => config !== undefined);
      return apiFormat === undefined ? configs : configs.filter((config) => config.apiFormat === apiFormat);
    },
    async get(apiFormat, modelId) {
      return store.get(userModelConfigKey(apiFormat, modelId));
    },
    async save(config) {
      store.set(userModelConfigKey(config.apiFormat, config.modelId), config);
    },
    async delete(apiFormat, modelId) {
      store.delete(userModelConfigKey(apiFormat, modelId));
    },
  };
}

function createInMemoryModelGenerationPreferenceRepository(): ModelGenerationPreferenceRepository {
  const store = new Map<string, ModelGenerationPreference>();
  return {
    async get(key) {
      return store.get(modelGenerationPreferenceKey(key));
    },
    async save(preference) {
      store.set(modelGenerationPreferenceKey(preference), preference);
    },
    async delete(key) {
      store.delete(modelGenerationPreferenceKey(key));
    },
  };
}

function createInMemorySecretStorageAdapter(): SecretStorageAdapter {
  const store = new Map<string, string>();
  return {
    async getSecret(key: string): Promise<string | undefined> {
      return store.get(key);
    },
    async setSecret(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async deleteSecret(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

function createInMemoryJobHistoryStore(): JobHistoryStore {
  const store = new Map<string, DurableJobRecord>();
  return {
    async put(record: DurableJobRecord): Promise<void> {
      store.set(record.jobId, record);
    },
    async get(jobId: string): Promise<DurableJobRecord | undefined> {
      return store.get(jobId);
    },
    async list(query?: { readonly limit?: number; readonly status?: string }): Promise<readonly DurableJobRecord[]> {
      const records = Array.from(store.values()).filter((record) => {
        if (query?.status !== undefined && record.status !== query.status) {
          return false;
        }
        return true;
      });
      return typeof query?.limit === 'number' ? records.slice(0, query.limit) : records;
    },
    async delete(jobId: string): Promise<void> {
      store.delete(jobId);
    },
  };
}

function createInMemoryTaskStore(): TaskStore {
  const store = new Map<string, TaskRecord>();
  return {
    async put(record: TaskRecord): Promise<void> {
      assertTaskRecord(record);
      store.set(record.taskId, record);
    },
    async get(taskId: string): Promise<TaskRecord | undefined> {
      return store.get(taskId);
    },
    async list(query?: { readonly limit?: number; readonly status?: string }): Promise<readonly TaskRecord[]> {
      const records = Array.from(store.values())
        .filter((record) => query?.status === undefined || record.status === query.status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return typeof query?.limit === 'number' ? records.slice(0, query.limit) : records;
    },
    async delete(taskId: string): Promise<void> {
      store.delete(taskId);
    },
  };
}

function createInMemoryAssetStore(): AssetStore {
  const store = new Map<string, ArrayBuffer>();
  let counter = 0;
  return {
    async put(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string }): Promise<StoredAssetRef> {
      const ref = `memory-asset-${++counter}`;
      store.set(ref, bytes);
      return {
        kind: 'hostObject',
        ref,
        ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
        ...(meta.name !== undefined ? { name: meta.name } : {}),
        byteSize: bytes.byteLength,
      };
    },
    async resolve(ref: StoredAssetRef): Promise<ArrayBuffer | undefined> {
      return store.get(ref.ref);
    },
    async delete(ref: StoredAssetRef): Promise<void> {
      store.delete(ref.ref);
    },
  };
}

function createDefaultProviderConfigResolver(): ProviderConfigResolver {
  return {
    async resolve(profileId: string): Promise<ResolvedProviderConfig> {
      const profile = await getProviderProfileRepository().get(profileId);
      if (!profile) {
        throw new Error(`Provider profile not found: ${profileId}`);
      }

      const provider = getRuntime().providerRegistry.getByApiFormat(profile.apiFormat);
      if (!provider) {
        throw new Error(`Provider implementation not found for apiFormat: ${profile.apiFormat}`);
      }
      const implementationId = providerImplementationIdForApiFormat(profile.apiFormat);

      const resolvedSecrets: Record<string, string> = {};
      for (const [name, ref] of Object.entries(profile.secretRefs ?? {})) {
        const value = await getSecretStorageAdapter().getSecret(ref);
        if (value === undefined) {
          throw new Error(`Provider profile secret is missing: ${name}`);
        }
        resolvedSecrets[name] = resolveSecretValue(value);
      }

      const resolvedBilling = await resolveBillingSecretConfig(profile.config, profile.secretRefs);

      const providerConfig = provider.validateConfig({
        providerId: implementationId,
        displayName: profile.displayName,
        apiFormat: profile.apiFormat,
        family: provider.family,
        ...profile.config,
        ...resolvedBilling,
        ...resolvedSecrets,
      });

      return {
        profileId,
        apiFormat: profile.apiFormat,
        implementationId,
        providerConfig,
      };
    },
  };
}

async function resolveBillingSecretConfig(
  config: Record<string, unknown>,
  secretRefs: Readonly<Record<string, string>> | undefined,
): Promise<Record<string, unknown>> {
  const billing = config.billing;
  if (typeof billing !== 'object' || billing === null || Array.isArray(billing)) {
    return {};
  }
  const record = billing as Record<string, unknown>;
  if (record.mode !== 'new-api') {
    return {};
  }
  const accessTokenSecretRef =
    typeof record.accessTokenSecretRef === 'string' && record.accessTokenSecretRef.length > 0
      ? record.accessTokenSecretRef
      : typeof secretRefs?.billingAccessToken === 'string'
        ? secretRefs.billingAccessToken
        : undefined;
  if (!accessTokenSecretRef) {
    throw new Error('Provider billing config requires accessTokenSecretRef.');
  }
  const raw = await getSecretStorageAdapter().getSecret(accessTokenSecretRef);
  if (raw === undefined) {
    throw new Error('Provider billing access token is missing.');
  }
  return {
    billing: {
      ...record,
      accessTokenSecretRef: resolveSecretValue(raw),
    },
  };
}

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/\s+/g, '').replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      continue;
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(out);
}

function bytesFromAsset(asset: Record<string, unknown>): ArrayBuffer | undefined {
  const data = asset.data;
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
  }
  if (typeof data === 'string' && data.length > 0) {
    const comma = data.startsWith('data:') ? data.indexOf(',') + 1 : 0;
    const b64 = data.slice(comma);
    const bytes = decodeBase64(b64);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }
  return undefined;
}

function storedRefFromAsset(asset: Record<string, unknown>): StoredAssetRef | undefined {
  const ref = asset.storedRef;
  if (typeof ref !== 'object' || ref === null || Array.isArray(ref)) {
    return undefined;
  }
  const record = ref as Record<string, unknown>;
  const kind = record.kind;
  if (kind !== 'inline' && kind !== 'url' && kind !== 'hostObject' && kind !== 'externalToken') {
    return undefined;
  }
  if (typeof record.ref !== 'string' || record.ref.length === 0) {
    return undefined;
  }
  return record as unknown as StoredAssetRef;
}

function sanitizeAssetForDurableInput(asset: unknown): unknown {
  if (!isPlainRecord(asset)) {
    return asset;
  }
  const storedRef = storedRefFromAsset(asset);
  if (storedRef === undefined) {
    return asset;
  }
  const { data: _data, ...rest } = asset;
  return rest;
}

function sanitizeJobInputForDurableHistory(input: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input };
  if (Array.isArray(next.images)) {
    next.images = next.images.map(sanitizeAssetForDurableInput);
  }
  if (next.maskImage !== undefined) {
    next.maskImage = sanitizeAssetForDurableInput(next.maskImage);
  }
  return next;
}

async function materializeOutputRefs(output: Record<string, unknown> | undefined): Promise<readonly StoredAssetRef[]> {
  const image = output?.image as { assets?: unknown } | undefined;
  const assets = Array.isArray(image?.assets) ? image.assets : [];
  const refs: StoredAssetRef[] = [];

  for (const asset of assets) {
    if (typeof asset !== 'object' || asset === null) {
      continue;
    }
    const record = asset as Record<string, unknown>;
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType : undefined;
    const name = typeof record.name === 'string' ? record.name : undefined;
    const storedRef = storedRefFromAsset(record);
    if (storedRef !== undefined) {
      refs.push(storedRef);
      continue;
    }
    const bytes = bytesFromAsset(record);

    if (bytes !== undefined) {
      refs.push(await getAssetStore().put(bytes, { mimeType, name }));
      continue;
    }

    if (typeof record.url === 'string' && record.url.length > 0) {
      refs.push({ kind: 'url', ref: record.url, ...(mimeType !== undefined ? { mimeType } : {}), ...(name !== undefined ? { name } : {}) });
      continue;
    }

    if (typeof record.fileId === 'string' && record.fileId.length > 0) {
      refs.push({
        kind: 'externalToken',
        ref: record.fileId,
        ...(mimeType !== undefined ? { mimeType } : {}),
        ...(name !== undefined ? { name } : {}),
      });
    }
  }

  return refs;
}

function outputAssetsFromJobOutput(output: Record<string, unknown> | undefined): readonly Record<string, unknown>[] {
  const image = output?.image as { assets?: unknown } | undefined;
  const assets = Array.isArray(image?.assets) ? image.assets : [];
  return assets.filter(isPlainRecord);
}

function outputSourceFromAsset(asset: Record<string, unknown>, ref: StoredAssetRef): TaskOutput['source'] {
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return {
      providerAssetKind: 'url',
      sanitizedOriginalUrl: sanitizeTaskEvidenceUrl(asset.url),
    };
  }
  if (typeof asset.fileId === 'string' && asset.fileId.length > 0) {
    return {
      providerAssetKind: 'fileId',
      fileId: asset.fileId,
    };
  }
  if (asset.data !== undefined) {
    return { providerAssetKind: 'base64' };
  }
  return { providerAssetKind: ref.kind === 'url' ? 'url' : 'storedRef' };
}

function taskOutputsFromRefs(taskId: string, output: Record<string, unknown> | undefined, refs: readonly StoredAssetRef[]): readonly TaskOutput[] {
  const assets = outputAssetsFromJobOutput(output);
  return refs.map((ref, index) => {
    const sourceAsset = assets[index] ?? {};
    const taskOutput: TaskOutput = {
      outputId: `${taskId}:output:${index}`,
      index,
      kind: 'image',
      asset: { ref },
      source: outputSourceFromAsset(sourceAsset, ref),
    };
    return taskOutput;
  });
}

function normalizedTaskError(error: JobError | undefined, fallback: string): TaskRecord['error'] {
  return {
    category: error?.category ?? 'runtime',
    message: error?.message ?? fallback,
  };
}

async function executionSnapshotFromJobInput(input: Record<string, unknown>): Promise<TaskExecutionSnapshot | undefined> {
  const profileId = typeof input.profileId === 'string'
    ? input.profileId
    : typeof input.providerProfileId === 'string'
      ? input.providerProfileId
      : undefined;
  const requestModel = isPlainRecord(input.model) ? input.model : undefined;
  const providerOptions = isPlainRecord(input.providerOptions) ? input.providerOptions : undefined;
  const modelId = typeof requestModel?.modelId === 'string'
    ? requestModel.modelId
    : typeof providerOptions?.model === 'string'
      ? providerOptions.model
      : undefined;
  const output = isPlainRecord(input.output) ? input.output : undefined;
  const profile = profileId ? await getProviderProfileRepository().get(profileId) : undefined;

  return {
    ...(profileId !== undefined ? { profileId } : {}),
    ...(profile?.displayName !== undefined ? { profileName: profile.displayName } : {}),
    ...(profile?.apiFormat !== undefined ? { apiFormat: profile.apiFormat } : {}),
    ...(modelId !== undefined ? { modelId } : {}),
    ...(output
      ? {
          output: {
            ...(typeof output.count === 'number' ? { count: output.count } : {}),
            ...(typeof output.size === 'string' ? { size: output.size } : {}),
            ...(typeof output.format === 'string' ? { format: output.format } : {}),
            ...(typeof output.quality === 'string' ? { quality: output.quality } : {}),
          },
        }
      : {}),
  };
}

async function flushTerminalTaskHistory(job: Job, outputRefs: readonly StoredAssetRef[]): Promise<void> {
  if (job.status !== 'completed' && job.status !== 'failed') {
    return;
  }
  const taskId = typeof job.input.__clientTaskId === 'string' ? job.input.__clientTaskId : undefined;
  if (taskId === undefined || taskId.length === 0) {
    return;
  }

  const existing = await getTaskStore().get(taskId);
  if (!existing) {
    return;
  }

  const finishedAt = job.updatedAt;
  const execution = await executionSnapshotFromJobInput(job.input);
  const base: Omit<TaskRecord, 'status' | 'outputs' | 'error' | 'finishedAt'> = {
    ...existing,
    updatedAt: job.updatedAt,
    execution: {
      ...(existing.execution ?? {}),
      ...(execution ?? {}),
    },
    executionJobId: job.id,
  };
  const terminal: TaskRecord = job.status === 'completed'
    ? {
        ...base,
        status: 'completed',
        outputs: taskOutputsFromRefs(taskId, job.output, outputRefs),
        finishedAt,
      }
    : {
        ...base,
        status: 'failed',
        outputs: [],
        error: normalizedTaskError(job.error, 'Job failed.'),
        finishedAt,
      };

  assertTaskRecord(terminal);
  await getTaskStore().put(terminal);
}

async function flushTaskMaterializationFailure(job: Job, error: unknown): Promise<void> {
  const taskId = typeof job.input.__clientTaskId === 'string' ? job.input.__clientTaskId : undefined;
  if (taskId === undefined || taskId.length === 0) {
    return;
  }
  const existing = await getTaskStore().get(taskId);
  if (!existing) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const failed: TaskRecord = {
    ...existing,
    status: 'failed',
    outputs: [],
    error: {
      category: 'storage',
      message,
    },
    executionJobId: job.id,
    updatedAt: job.updatedAt,
    finishedAt: job.updatedAt,
  };
  assertTaskRecord(failed);
  await getTaskStore().put(failed);
}

function assetFromStoredRef(record: Record<string, unknown>, storedRef: StoredAssetRef): Record<string, unknown> {
  const type = typeof record.type === 'string' ? record.type : 'image';
  const name = typeof record.name === 'string' ? record.name : storedRef.name;
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType : storedRef.mimeType;
  return {
    type,
    ...(name !== undefined ? { name } : {}),
    ...(mimeType !== undefined ? { mimeType } : {}),
    storedRef,
  };
}

async function materializeOutputAsset(asset: unknown): Promise<unknown> {
  if (!isPlainRecord(asset)) {
    return asset;
  }
  const existingRef = storedRefFromAsset(asset);
  if (existingRef !== undefined) {
    return assetFromStoredRef(asset, existingRef);
  }
  const mimeType = typeof asset.mimeType === 'string' ? asset.mimeType : undefined;
  const name = typeof asset.name === 'string' ? asset.name : undefined;
  const bytes = bytesFromAsset(asset);
  if (bytes !== undefined) {
    const storedRef = await getAssetStore().put(bytes, { mimeType, name });
    return assetFromStoredRef(asset, storedRef);
  }
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return {
      ...assetFromStoredRef(asset, {
        kind: 'url',
        ref: asset.url,
        ...(mimeType !== undefined ? { mimeType } : {}),
        ...(name !== undefined ? { name } : {}),
      }),
      url: asset.url,
    };
  }
  if (typeof asset.fileId === 'string' && asset.fileId.length > 0) {
    return {
      ...assetFromStoredRef(asset, {
        kind: 'externalToken',
        ref: asset.fileId,
        ...(mimeType !== undefined ? { mimeType } : {}),
        ...(name !== undefined ? { name } : {}),
      }),
      fileId: asset.fileId,
    };
  }
  return asset;
}

async function materializeProviderOutputForLongLivedState(result: unknown): Promise<unknown> {
  if (!isPlainRecord(result)) {
    return result;
  }
  const assets = Array.isArray(result.assets) ? result.assets : undefined;
  if (assets === undefined) {
    return result;
  }
  const materializedAssets: unknown[] = [];
  for (const asset of assets) {
    materializedAssets.push(await materializeOutputAsset(asset));
  }
  return {
    ...result,
    assets: materializedAssets,
  };
}

interface DurableJobFlushOptions {
  readonly originJobId?: string;
  readonly retryAttempt?: number;
}

async function flushTerminalJobHistory(job: Job, options?: DurableJobFlushOptions): Promise<void> {
  if (job.status !== 'completed' && job.status !== 'failed') {
    return;
  }

  const workflow = typeof job.input._workflowName === 'string' ? job.input._workflowName : 'unknown';
  const originJobId = options?.originJobId ?? job.originJobId;
  const retryAttempt = options?.retryAttempt ?? job.retryAttempt;
  let outputRefs: readonly StoredAssetRef[];
  try {
    outputRefs = await materializeOutputRefs(job.output);
  } catch (error) {
    await flushTaskMaterializationFailure(job, error);
    throw error;
  }
  const record: DurableJobRecord = {
    schemaVersion: 1,
    jobId: job.id,
    status: job.status,
    workflow,
    input: sanitizeJobInputForDurableHistory(job.input),
    outputs: outputRefs,
    ...(job.error !== undefined ? { error: job.error } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(originJobId !== undefined ? { originJobId } : {}),
    ...(retryAttempt !== undefined ? { retryAttempt } : {}),
  };

  assertNoSecrets(record);
  await getJobHistoryStore().put(record);
  await flushTerminalTaskHistory(job, outputRefs);
}

/**
 * 从 params 中定位 request 对象。
 *
 * 兼容两种 params 结构：
 * (a) params 含 `request` key → `params.request` 为 request
 * (b) params 不含 `request` key → 整个 params（排除 signal 等 meta key）即 request
 */
function locateRequestInParams(params: Record<string, unknown>): {
  requestObj: Record<string, unknown>;
  hasRequestKey: boolean;
} {
  if ('request' in params && typeof params.request === 'object' && params.request !== null) {
    return { requestObj: params.request as Record<string, unknown>, hasRequestKey: true };
  }
  return { requestObj: params, hasRequestKey: false };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createValidationError('Job submission was cancelled.', { reason: 'abort-signal' });
  }
}

async function resolveStoredAssetForDispatch(asset: unknown, signal?: AbortSignal): Promise<unknown> {
  throwIfAborted(signal);
  if (!isPlainRecord(asset)) {
    return asset;
  }
  const storedRef = storedRefFromAsset(asset);
  if (storedRef === undefined || asset.data !== undefined || asset.url !== undefined || asset.fileId !== undefined) {
    return asset;
  }
  const bytes = await getAssetStore().resolve(storedRef);
  throwIfAborted(signal);
  if (bytes === undefined) {
    throw new Error(`AssetStore object is unavailable: ${storedRef.ref}`);
  }
  return {
    ...asset,
    data: new Uint8Array(bytes),
  };
}

async function resolveStoredAssetsForDispatch(params: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  throwIfAborted(signal);
  const { requestObj, hasRequestKey } = locateRequestInParams(params);
  let nextRequest = requestObj;

  if (Array.isArray(requestObj.images)) {
    const images: unknown[] = [];
    for (const image of requestObj.images) {
      images.push(await resolveStoredAssetForDispatch(image, signal));
    }
    nextRequest = {
      ...nextRequest,
      images,
    };
  }
  if (requestObj.maskImage !== undefined) {
    nextRequest = {
      ...nextRequest,
      maskImage: await resolveStoredAssetForDispatch(requestObj.maskImage, signal),
    };
  }

  if (nextRequest === requestObj) {
    return params;
  }
  return hasRequestKey ? { ...params, request: nextRequest } : { ...params, ...nextRequest };
}

function explicitModelIdFromRequest(requestObj: Record<string, unknown>): string | undefined {
  const model = requestObj.model;
  if (isPlainRecord(model) && typeof model.modelId === 'string' && model.modelId.length > 0) {
    return model.modelId;
  }
  const providerOptions = isPlainRecord(requestObj.providerOptions) ? requestObj.providerOptions : undefined;
  return typeof providerOptions?.model === 'string' && providerOptions.model.length > 0
    ? providerOptions.model
    : undefined;
}

function providerFallbackModelId(providerConfig: unknown): string | undefined {
  if (!isPlainRecord(providerConfig)) {
    return undefined;
  }
  const value = providerConfig.defaultModel;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stripProviderOptionsModel(providerOptions: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainRecord(providerOptions)) {
    return undefined;
  }
  const { model: _model, ...rest } = providerOptions;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function injectResolvedModelAndOutput(args: {
  readonly params: Record<string, unknown>;
  readonly model: ProviderModelExecution;
  readonly output: Readonly<Record<string, unknown>>;
}): Record<string, unknown> {
  const { params, model } = args;
  const { requestObj, hasRequestKey } = locateRequestInParams(params);
  const providerOptions = stripProviderOptionsModel(requestObj.providerOptions);
  const currentOutput = isPlainRecord(requestObj.output) ? requestObj.output : {};
  const newRequest = {
    ...requestObj,
    model,
    output: {
      ...currentOutput,
      ...args.output,
    },
    ...(providerOptions !== undefined ? { providerOptions } : {}),
  };
  if (providerOptions === undefined) {
    delete (newRequest as Record<string, unknown>).providerOptions;
  }

  if (hasRequestKey) {
    return { ...params, request: newRequest };
  }
  return { ...params, ...newRequest };
}

function operationFromRequest(requestObj: Readonly<Record<string, unknown>>): ProviderOperation {
  return requestObj.operation === 'image_edit' ? 'image_edit' : 'text_to_image';
}

async function resolveModelParamsForDispatch(args: {
  readonly params: Record<string, unknown>;
  readonly profile: ProviderProfile;
  readonly providerConfig: unknown;
}): Promise<Record<string, unknown>> {
  const { requestObj } = locateRequestInParams(args.params);
  const explicitModelId = explicitModelIdFromRequest(requestObj);
  const selectedModelId = explicitModelId ?? args.profile.defaultModelId ?? providerFallbackModelId(args.providerConfig);
  if (typeof selectedModelId !== 'string' || selectedModelId.length === 0) {
    throw createValidationError(`Provider profile "${args.profile.profileId}" has no selected model for dispatch.`, {
      profileId: args.profile.profileId,
    });
  }
  if (!args.profile.selectedModelIds.includes(selectedModelId)) {
    throw createValidationError(`Provider profile "${args.profile.profileId}" model "${selectedModelId}" is not selected.`, {
      profileId: args.profile.profileId,
      modelId: selectedModelId,
    });
  }
  const resolved = await resolveConfiguredModel({
    profileId: args.profile.profileId,
    apiFormat: args.profile.apiFormat,
    modelId: selectedModelId,
    userModelConfigRepository: getUserModelConfigRepository(),
  });
  const requestOutput = resolveModelGenerationSettingsValue({
    key: {
      profileId: args.profile.profileId,
      apiFormat: args.profile.apiFormat,
      modelId: resolved.modelId,
      operation: operationFromRequest(requestObj),
    },
    preference: await getModelGenerationPreferenceRepository().get({
      profileId: args.profile.profileId,
      apiFormat: args.profile.apiFormat,
      modelId: resolved.modelId,
      operation: operationFromRequest(requestObj),
    }),
    userConfig: resolved.source === 'user' ? resolved : undefined,
  });
  return injectResolvedModelAndOutput({
    params: args.params,
    model: toProviderModelExecution(resolved),
    output: {
      sizePreset: requestOutput.selection.imageSize === 'auto' ? undefined : requestOutput.selection.imageSize,
      aspectRatio: requestOutput.selection.ratio,
      outputFormat: requestOutput.selection.outputFormat,
      requestOutput: requestOutput.requestOutput,
    },
  });
}

/**
 * 判断值是否为 workflow input binding 的未解析模板字面量占位符
 *（如 `'${providerProfileId}'`）。
 */
function isTemplateLiteralPlaceholder(val: unknown): boolean {
  return typeof val === 'string' && /^\$\{[^}]+\}$/.test(val);
}

/**
 * 从 params 中解析有效的 profileId。
 *
 * 优先使用 `providerProfileId`，当其存在且不是模板字面量占位符时直接选用；
 * 否则 fallback 到 `profileId`；若两者都是占位符，返回 `undefined`。
 */
function resolveProfileId(params: Record<string, unknown>): string | undefined {
  if (
    !isTemplateLiteralPlaceholder(params.providerProfileId) &&
    typeof params.providerProfileId === 'string' &&
    params.providerProfileId.length > 0
  ) {
    return params.providerProfileId;
  }
  if (
    !isTemplateLiteralPlaceholder(params.profileId) &&
    typeof params.profileId === 'string' &&
    params.profileId.length > 0
  ) {
    return params.profileId;
  }
  return undefined;
}

function createProfileAwareDispatchAdapter(logger?: Logger): ReturnType<typeof createDispatchAdapter> {
  return {
    provider: 'profile',

    async dispatch(params: Record<string, unknown>, context?: { readonly logger?: Logger; readonly signal?: AbortSignal }): Promise<unknown> {
      throwIfAborted(context?.signal);
      const dispatchLogger = context?.logger ?? logger;
      const profileId = resolveProfileId(params);
      if (profileId === undefined || profileId.trim().length === 0) {
        throw new Error('Provider profile dispatch requires a non-empty providerProfileId or profileId.');
      }

      const profile = await getProviderProfileRepository().get(profileId);
      if (!profile) {
        throw new Error(`Provider profile not found: ${profileId}`);
      }
      const { providerConfig } = await getProviderConfigResolver().resolve(profileId);
      throwIfAborted(context?.signal);
      const apiFormat = (providerConfig as { readonly apiFormat?: unknown }).apiFormat;
      if (typeof apiFormat !== 'string') {
        throw new Error('Resolved provider config requires apiFormat.');
      }
      const provider = getRuntime().providerRegistry.getByApiFormat(apiFormat as never);
      if (!provider) {
        throw new Error(`Provider implementation not found for apiFormat: ${apiFormat}`);
      }

      // Capability guard：在 dispatch 到 provider.invoke 前，用 descriptor.operations
      // 做任务级校验，避免提交不支持的 operation 才在上游 400/500 处暴露。
      const { requestObj } = locateRequestInParams(params);
      const operation = requestObj.operation;
      if (typeof operation === 'string') {
        const descriptor = provider.describe();
        if (!descriptor.operations.includes(operation as ProviderOperation)) {
          throw new Error(
            `Profile "${profileId}" uses provider "${descriptor.displayName}" (${provider.id}). ` +
              `Operation "${operation}" is not supported. ` +
              `Supported: [${descriptor.operations.join(', ')}].`,
          );
        }
      }

      const modelResolvedParams = await resolveModelParamsForDispatch({
        params,
        profile,
        providerConfig,
      });
      const resolvedParams = await resolveStoredAssetsForDispatch(modelResolvedParams, context?.signal);

      const adapter = createDispatchAdapter({ provider, config: providerConfig, logger: dispatchLogger });
      return adapter.dispatch(resolvedParams, context);
    },
  };
}

/**
 * 获取 Runtime 单例
 *
 * 首次调用时懒初始化，注入 builtinWorkflows 与 provider adapters。
 * 返回对象额外暴露 `registry` 属性用于 provider 访问。
 */
export function getRuntime(): ExtendedRuntime {
  if (instance === null) {
    registryInstance = createProviderRegistry();
    registerBuiltins(registryInstance);

    const logger = runtimeLogger ?? createNullLogger();

    const mockProvider = registryInstance.get('mock')!;
    const mockConfig = mockProvider.validateConfig({
      providerId: 'mock',
      displayName: 'Mock Provider',
      family: mockProvider.family,
      apiFormat: 'openai-images',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
      },
      apiKey: 'mock-key',
    });
    const mockAdapter = createDispatchAdapter({
      provider: mockProvider,
      config: mockConfig,
      logger,
    });

    const baseRuntime = createRuntime({
      initialWorkflows: builtinWorkflows,
      adapters: [mockAdapter, createProfileAwareDispatchAdapter(logger)],
      logger,
      async afterStepResult({ result }) {
        return materializeProviderOutputForLongLivedState(result);
      },
    });

    instance = Object.assign(baseRuntime, {
      providerRegistry: {
        list: () => registryInstance!.list(),
        get: (id: string) => registryInstance!.get(id),
        getByApiFormat: (apiFormat: ApiFormat) => registryInstance!.getByApiFormat(apiFormat),
      },
    }) as ExtendedRuntime;
  }
  return instance;
}

/** 获取当前 provider profile repository */
export function getProviderProfileRepository(): ProviderProfileRepository {
  if (providerProfileRepositoryInstance === null) {
    providerProfileRepositoryInstance = createInMemoryProviderProfileRepository();
  }
  return providerProfileRepositoryInstance;
}

/** 设置 provider profile repository，允许 CLI / UI 注入自定义实现 */
export function setProviderProfileRepository(repository: ProviderProfileRepository): void {
  providerProfileRepositoryInstance = repository;
}

export function getModelDiscoveryCacheRepository(): ModelDiscoveryCacheRepository {
  if (modelDiscoveryCacheRepositoryInstance === null) {
    modelDiscoveryCacheRepositoryInstance = createInMemoryModelDiscoveryCacheRepository();
  }
  return modelDiscoveryCacheRepositoryInstance;
}

export function setModelDiscoveryCacheRepository(repository: ModelDiscoveryCacheRepository): void {
  modelDiscoveryCacheRepositoryInstance = repository;
}

export function getUserModelConfigRepository(): UserModelConfigRepository {
  if (userModelConfigRepositoryInstance === null) {
    userModelConfigRepositoryInstance = createInMemoryUserModelConfigRepository();
  }
  return userModelConfigRepositoryInstance;
}

export function setUserModelConfigRepository(repository: UserModelConfigRepository): void {
  userModelConfigRepositoryInstance = repository;
}

export function getModelGenerationPreferenceRepository(): ModelGenerationPreferenceRepository {
  if (modelGenerationPreferenceRepositoryInstance === null) {
    modelGenerationPreferenceRepositoryInstance = createInMemoryModelGenerationPreferenceRepository();
  }
  return modelGenerationPreferenceRepositoryInstance;
}

export function setModelGenerationPreferenceRepository(repository: ModelGenerationPreferenceRepository): void {
  modelGenerationPreferenceRepositoryInstance = repository;
}

/** 获取当前 secret storage adapter */
export function getSecretStorageAdapter(): SecretStorageAdapter {
  if (secretStorageAdapterInstance === null) {
    secretStorageAdapterInstance = createInMemorySecretStorageAdapter();
  }
  return secretStorageAdapterInstance;
}

/** 设置 secret storage adapter，允许 CLI / UI 注入自定义实现 */
export function setSecretStorageAdapter(adapter: SecretStorageAdapter): void {
  secretStorageAdapterInstance = adapter;
}

/** 获取当前 job history store */
export function getJobHistoryStore(): JobHistoryStore {
  if (jobHistoryStoreInstance === null) {
    jobHistoryStoreInstance = createInMemoryJobHistoryStore();
  }
  return jobHistoryStoreInstance;
}

/** 设置 job history store，允许 CLI / UI 注入自定义实现 */
export function setJobHistoryStore(store: JobHistoryStore): void {
  jobHistoryStoreInstance = store;
}

/** 获取当前 task store */
export function getTaskStore(): TaskStore {
  if (taskStoreInstance === null) {
    taskStoreInstance = createInMemoryTaskStore();
  }
  return taskStoreInstance;
}

/** 设置 task store，允许 UI / host adapters 注入自定义实现 */
export function setTaskStore(store: TaskStore): void {
  taskStoreInstance = store;
}

/** 获取当前 asset store */
export function getAssetStore(): AssetStore {
  if (assetStoreInstance === null) {
    assetStoreInstance = createInMemoryAssetStore();
  }
  return assetStoreInstance;
}

/** 设置 asset store，允许 CLI / UI 注入自定义实现 */
export function setAssetStore(store: AssetStore): void {
  assetStoreInstance = store;
}

/** 获取当前 provider config resolver */
export function getProviderConfigResolver(): ProviderConfigResolver {
  if (providerConfigResolverInstance === null) {
    providerConfigResolverInstance = createDefaultProviderConfigResolver();
  }
  return providerConfigResolverInstance;
}

/** 设置 provider config resolver，允许 CLI / UI 注入自定义实现 */
export function setProviderConfigResolver(resolver: ProviderConfigResolver): void {
  providerConfigResolverInstance = resolver;
}

/** 配置 application runtime 的日志 sink 与表面。 */
export function configureRuntimeLogging(sink: LogSink, surface: 'uxp'): void {
  runtimeLogger = createLogger({
    sink,
    context: {
      surface,
      package: 'application',
      component: 'runtime',
    },
  });
}

/** 获取当前配置的 runtime logger，未配置时返回 null logger。 */
export function getRuntimeLogger(): Logger {
  return runtimeLogger ?? createNullLogger();
}

/** 重置单例（仅供测试），同时重置所有 adapter */
export function _resetForTesting(): void {
  instance = null;
  registryInstance = null;
  providerProfileRepositoryInstance = null;
  modelDiscoveryCacheRepositoryInstance = null;
  userModelConfigRepositoryInstance = null;
  modelGenerationPreferenceRepositoryInstance = null;
  secretStorageAdapterInstance = null;
  providerConfigResolverInstance = null;
  jobHistoryStoreInstance = null;
  taskStoreInstance = null;
  assetStoreInstance = null;
  runtimeLogger = undefined;
}

/**
 * 直接注入已装配的 Runtime 实例（仅供测试）。
 *
 * 用于端到端 submit→retry→provider 计数测试：让真实 `submitJob`/`retryJob` 命令
 * （它们调用 `getRuntime()`）使用注入的、带 counting/deferred provider adapter 的
 * runtime，从而在真实命令路径上观测 L2（新建 Job）/ L3（provider.invoke）计数。
 * 调用方需自行确保已通过 `setJobHistoryStore` 等注入配套 adapter。
 */
export function _setRuntimeInstanceForTesting(runtime: ExtendedRuntime): void {
  instance = runtime;
}

/** 将 terminal job 写入 host-injected durable history。 */
export async function flushJobHistoryForTerminalJob(job: Job, options?: DurableJobFlushOptions): Promise<void> {
  await flushTerminalJobHistory(job, options);
}

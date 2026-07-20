/**
 * Runtime 单例管理
 *
 * 本模块持有唯一的 Runtime 实例，仅 `commands/` 模块可以 import。
 * UI 层、host 层 MUST NOT 直接引用。
 */

import {
  assertNoSecrets,
  createExecutionError,
  createValidationError,
  createRuntime,
  type DurableJobRecord,
  type Job,
  type Runtime,
  type StoredAssetRef,
} from '@imagen-ps/core-engine';
import {
  createProviderExecutionAdapter,
  createProviderRegistry,
  registerBuiltins,
  type ApiFormat,
  type ProviderRequest,
  type ProviderRegistry,
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
import { resolveSecretValue } from './commands/secret-utils.js';
import { providerImplementationIdForApiFormat } from './commands/api-format-profile.js';
import { runTerminalJobBillingFollowUp } from './commands/terminal-job-billing.js';
import {
  createProviderGenerationBackend,
  type GenerationBackend,
} from './generation/index.js';
import {
  createApplicationComfyUiExecutionAdapter,
  setComfyUiExecutionHostPorts,
} from './comfyui/runtime-adapter.js';
import { builtinWorkflows } from './requests/index.js';
import {
  assertTaskRecord,
  type TaskRecord,
} from './task.js';

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
let providerGenerationBackendInstance: GenerationBackend | null = null;
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

function userModelConfigKey(profileId: string, modelId: string): string {
  return `${profileId}:${modelId}`;
}

function modelGenerationPreferenceKey(key: ModelGenerationPreferenceKey): string {
  return `${key.profileId}:${key.apiFormat}:${key.modelId}:${key.operation}`;
}

function createInMemoryUserModelConfigRepository(): UserModelConfigRepository {
  const store = new Map<string, UserModelConfig>();
  return {
    async list(profileId) {
      const configs = Array.from(store.values()).filter((config): config is NonNullable<typeof config> => config !== undefined);
      return configs.filter((config) => config.profileId === profileId);
    },
    async get(profileId, modelId) {
      return store.get(userModelConfigKey(profileId, modelId));
    },
    async save(config) {
      store.set(userModelConfigKey(config.profileId, config.modelId), config);
    },
    async delete(profileId, modelId) {
      store.delete(userModelConfigKey(profileId, modelId));
    },
    async deleteProfile(profileId) {
      for (const key of Array.from(store.keys())) {
        if (key.startsWith(`${profileId}:`)) {
          store.delete(key);
        }
      }
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
  if (record.source !== 'billing-token') {
    return {};
  }
  const tokenSecretRef =
    typeof record.tokenSecretRef === 'string' && record.tokenSecretRef.length > 0
      ? record.tokenSecretRef
      : typeof secretRefs?.billingToken === 'string'
        ? secretRefs.billingToken
        : undefined;
  if (!tokenSecretRef) {
    throw new Error('Provider billing config requires tokenSecretRef.');
  }
  const raw = await getSecretStorageAdapter().getSecret(tokenSecretRef);
  if (raw === undefined) {
    throw new Error('Provider billing token is missing.');
  }
  return {
    billing: {
      ...record,
      tokenSecretRef: resolveSecretValue(raw),
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
    if (isPlainRecord(next.maskImage) && isPlainRecord(next.maskImage.asset)) {
      next.maskImage = { ...next.maskImage, asset: sanitizeAssetForDurableInput(next.maskImage.asset) };
    }
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
  readonly workflowName?: string;
  readonly originJobId?: string;
  readonly retryAttempt?: number;
}

async function flushTerminalJobHistory(job: Job, options?: DurableJobFlushOptions): Promise<void> {
  if (job.status !== 'completed' && job.status !== 'failed') {
    return;
  }

  const workflow = options?.workflowName ?? 'unknown';
  const originJobId = options?.originJobId ?? job.originJobId;
  const retryAttempt = options?.retryAttempt ?? job.retryAttempt;
  const outputRefs = await materializeOutputRefs(job.output);
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
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createExecutionError('Provider request materialization was aborted.', { reason: 'abort-signal' });
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
    throw createExecutionError('Provider input asset is unavailable.', {
      ref: storedRef.ref,
      kind: storedRef.kind,
    });
  }
  return {
    ...asset,
    data: new Uint8Array(bytes),
  };
}

async function materializeProviderRequest(
  request: ProviderRequest,
  signal?: AbortSignal,
): Promise<ProviderRequest> {
  throwIfAborted(signal);
  let nextRequest: Record<string, unknown> = { ...request };

  if (Array.isArray(request.images)) {
    const images: unknown[] = [];
    for (const image of request.images) {
      images.push(await resolveStoredAssetForDispatch(image, signal));
    }
    nextRequest = {
      ...nextRequest,
      images,
    };
  }
  if (request.maskImage !== undefined) {
    const mask = request.maskImage;
    nextRequest = {
      ...nextRequest,
      maskImage: {
        ...mask,
        asset: await resolveStoredAssetForDispatch(mask.asset, signal),
      },
    };
  }

  return nextRequest as unknown as ProviderRequest;
}

function getProviderRegistry(): ProviderRegistry {
  if (registryInstance === null) {
    registryInstance = createProviderRegistry();
    registerBuiltins(registryInstance);
  }
  return registryInstance;
}

/**
 * 获取 Runtime 单例
 *
 * 首次调用时懒初始化，注入 builtinWorkflows 与 provider adapters。
 * 返回对象额外暴露 `registry` 属性用于 provider 访问。
 */
export function getRuntime(): ExtendedRuntime {
  if (instance === null) {
    const providerRegistry = getProviderRegistry();
    const logger = runtimeLogger ?? createNullLogger();
    const providerAdapter = createProviderExecutionAdapter({
      providerRegistry,
      configResolver: {
        async resolve({ implementationId, profileId }) {
          const resolved = await getProviderConfigResolver().resolve(profileId);
          if (resolved.implementationId !== implementationId) {
            throw createValidationError('Resolved Provider implementation does not match admission.', {
              profileId,
              implementationId,
              resolvedImplementationId: resolved.implementationId,
            });
          }
          return resolved.providerConfig;
        },
      },
      requestMaterializer: {
        async materialize({ request }, signal) {
          return materializeProviderRequest(request, signal);
        },
      },
      logger,
    });
    const comfyUiAdapter = createApplicationComfyUiExecutionAdapter(getAssetStore);

    const baseRuntime = createRuntime({
      initialWorkflows: builtinWorkflows,
      adapters: [providerAdapter, comfyUiAdapter],
      logger,
      async afterStepResult({ result }) {
        return materializeProviderOutputForLongLivedState(result);
      },
    });

    instance = Object.assign(baseRuntime, {
      providerRegistry: {
        list: () => providerRegistry.list(),
        get: (id: string) => providerRegistry.get(id),
        getByApiFormat: (apiFormat: ApiFormat) => providerRegistry.getByApiFormat(apiFormat),
      },
    }) as ExtendedRuntime;
  }
  return instance;
}

/** 获取 Application composition 已装配的 generation backends。 */
export function getGenerationBackends(): readonly GenerationBackend[] {
  if (providerGenerationBackendInstance === null) {
    providerGenerationBackendInstance = createProviderGenerationBackend({
      profileRepository: {
        async get(profileId) {
          return getProviderProfileRepository().get(profileId);
        },
      },
      providerRegistry: getProviderRegistry(),
      userModelConfigRepository: {
        async get(profileId, modelId) {
          return getUserModelConfigRepository().get(profileId, modelId);
        },
        async list(profileId) {
          return getUserModelConfigRepository().list(profileId);
        },
      },
      modelGenerationPreferenceRepository: {
        async get(key) {
          return getModelGenerationPreferenceRepository().get(key);
        },
      },
      async materializeOutput({ job }) {
        return materializeOutputRefs(job.output);
      },
      async afterTerminal({ job, profileId, implementationId }) {
        await runTerminalJobBillingFollowUp(job, profileId, implementationId);
      },
    });
  }
  return [providerGenerationBackendInstance];
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

/** 重置单例（仅供测试），同时重置所有 composition state。 */
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
  providerGenerationBackendInstance = null;
  setComfyUiExecutionHostPorts(undefined);
  runtimeLogger = undefined;
}

/**
 * 直接注入已装配的 Runtime 实例（仅供测试）。
 *
 * 用于端到端 execution 测试：让 Application command 使用注入的
 * counting/deferred runtime，观测 Job 与 adapter invocation。
 * 调用方需自行确保已通过 `setJobHistoryStore` 等注入配套 adapter。
 */
export function _setRuntimeInstanceForTesting(runtime: ExtendedRuntime): void {
  instance = runtime;
}

/** 将 terminal job 写入 host-injected durable history。 */
export async function flushJobHistoryForTerminalJob(job: Job, options?: DurableJobFlushOptions): Promise<void> {
  await flushTerminalJobHistory(job, options);
}

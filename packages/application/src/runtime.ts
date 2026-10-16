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
  type ProviderId,
  type ProviderRequest,
  type ProviderRegistry,
  getProviderCatalog,
} from '@imagen-ps/providers';
import type { LogSink, Logger } from '@imagen-ps/foundation';
import { createLogger, createNullLogger } from '@imagen-ps/foundation';
import type {
  AssetStore,
  JobHistoryStore,
  CatalogParameterPreference,
  CatalogParameterPreferenceRepository,
  ProviderAccount,
  ProviderAccountRepository,
  SecretStorageAdapter,
  TaskStore,
} from './commands/types.js';
import {
  createProviderGenerationBackend,
  type GenerationBackend,
} from './generation/index.js';
import { createFixedProviderResolver, type FixedProviderResolutionDependencies } from './generation/fixed-provider-resolution.js';
import {
  createProviderAsyncExecutionManager,
  type ProviderAsyncExecutionManager,
} from './generation/provider-async-execution-manager.js';
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
  readonly providerRegistry: Pick<ProviderRegistry, 'list' | 'get' | 'getByProviderId'>;
}

let instance: ExtendedRuntime | null = null;
let registryInstance: ProviderRegistry | null = null;
let providerAccountRepositoryInstance: ProviderAccountRepository | null = null;
let catalogParameterPreferenceRepositoryInstance: CatalogParameterPreferenceRepository | null = null;
let secretStorageAdapterInstance: SecretStorageAdapter | null = null;
let fixedProviderResolverInstance: ReturnType<typeof createFixedProviderResolver> | null = null;
let jobHistoryStoreInstance: JobHistoryStore | null = null;
let taskStoreInstance: TaskStore | null = null;
let assetStoreInstance: AssetStore | null = null;
let providerGenerationBackendInstance: GenerationBackend | null = null;
let providerAsyncExecutionManagerInstance: ProviderAsyncExecutionManager | null = null;
let runtimeLogger: Logger | undefined = undefined;

function createInMemoryProviderAccountRepository(): ProviderAccountRepository {
  const store = new Map<string, ProviderAccount>();
  return {
    async list() { return Array.from(store.values()); },
    async get(providerId) { return store.get(providerId); },
    async save(account) { store.set(account.providerId, account); },
    async delete(providerId) { store.delete(providerId); },
  };
}

function createInMemoryCatalogParameterPreferenceRepository(): CatalogParameterPreferenceRepository {
  const store = new Map<string, CatalogParameterPreference>();
  const key = (providerId: string, modelId: string) => `${providerId}:${modelId}`;
  return {
    async get(providerId, modelId) { return store.get(key(providerId, modelId)); },
    async save(preference) { store.set(key(preference.providerId, preference.modelId), preference); },
    async delete(providerId, modelId) { store.delete(key(providerId, modelId)); },
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
    const asyncExecutionManager = providerAsyncExecutionManagerInstance ??= createProviderAsyncExecutionManager();
    const providerAdapter = createProviderExecutionAdapter({
      providerRegistry,
      configResolver: {
        async resolve({ implementationId, providerId: _providerId }) {
          if (implementationId === 'grsai' || implementationId === 'runninghub') {
            const providerId = implementationId === 'grsai' ? 'grsai' : 'runninghub';
            const account = await getProviderAccountRepository().get(providerId);
            if (!account?.secretRef) throw createValidationError('Fixed provider API Key is not configured.', { providerId });
            const apiKey = await getSecretStorageAdapter().getSecret(account.secretRef);
            if (!apiKey?.trim()) throw createValidationError('Fixed provider API Key is missing.', { providerId });
            const catalog = getProviderCatalog(providerId);
            const endpoint = account.baseUrl ?? catalog.baseUrl;
            const connection = { selectionMode: 'manual' as const, selectedEndpointId: 'primary', endpoints: [{ id: 'primary', url: endpoint, enabled: true }] };
            const provider = providerRegistry.get(implementationId);
            if (!provider) throw createValidationError('Fixed provider implementation is not registered.', { implementationId });
            const providerConfig = provider.validateConfig({ providerId: implementationId, displayName: account.displayName, family: provider.describe().family, connection, apiKey, ...(implementationId === 'grsai' ? { paths: { submit: '/v1/api/generate', result: '/v1/api/result' } } : {}) });
            return providerConfig;
          }
          throw createValidationError('Only fixed GRSAI and RunningHub providers are supported.', { implementationId });
        },
      },
      requestMaterializer: {
        async materialize({ request }, signal) {
          return materializeProviderRequest(request, signal);
        },
      },
      asyncExecutionExecutor: asyncExecutionManager,
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
        getByProviderId: (providerId: ProviderId) => providerRegistry.getByProviderId(providerId),
      },
    }) as ExtendedRuntime;
  }
  return instance;
}

/** 获取 Application composition 已装配的 generation backends。 */
export function getGenerationBackends(): readonly GenerationBackend[] {
  if (providerGenerationBackendInstance === null) {
    providerGenerationBackendInstance = createProviderGenerationBackend({
      providerRegistry: getProviderRegistry(),
      fixedProviderResolver: getFixedProviderResolver(),
      async materializeOutput({ job }) {
        return materializeOutputRefs(job.output);
      },
      async afterTerminal() {},
    });
  }
  return [providerGenerationBackendInstance];
}

/** 获取固定 provider 单账号 repository。 */
export function getProviderAccountRepository(): ProviderAccountRepository {
  if (providerAccountRepositoryInstance === null) providerAccountRepositoryInstance = createInMemoryProviderAccountRepository();
  return providerAccountRepositoryInstance;
}

/** 注入固定 provider 单账号 repository。 */
export function setProviderAccountRepository(repository: ProviderAccountRepository): void { providerAccountRepositoryInstance = repository; }

/** 获取固定 provider 的 catalog/account 解析器；Key 仅在显式 resolveCredentials 时读取。 */
export function getFixedProviderResolver(): ReturnType<typeof createFixedProviderResolver> {
  if (fixedProviderResolverInstance === null) {
    const dependencies: FixedProviderResolutionDependencies = {
      accounts: { get: (providerId) => getProviderAccountRepository().get(providerId) },
      secrets: { getSecret: (key) => getSecretStorageAdapter().getSecret(key) },
    };
    fixedProviderResolverInstance = createFixedProviderResolver(dependencies);
  }
  return fixedProviderResolverInstance;
}

/** 返回 catalog 参数偏好仓库。 */
export function getCatalogParameterPreferenceRepository(): CatalogParameterPreferenceRepository {
  if (!catalogParameterPreferenceRepositoryInstance) catalogParameterPreferenceRepositoryInstance = createInMemoryCatalogParameterPreferenceRepository();
  return catalogParameterPreferenceRepositoryInstance;
}

/** 注入 host 持久化的 catalog 参数偏好仓库。 */
export function setCatalogParameterPreferenceRepository(repository: CatalogParameterPreferenceRepository): void {
  catalogParameterPreferenceRepositoryInstance = repository;
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
  providerAsyncExecutionManagerInstance?.dispose();
  providerAsyncExecutionManagerInstance = null;
  instance = null;
  registryInstance = null;
  providerAccountRepositoryInstance = null;
  fixedProviderResolverInstance = null;
  secretStorageAdapterInstance = null;
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

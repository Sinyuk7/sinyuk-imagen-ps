import { assertTaskRecord, decodeTaskRecord } from '@imagen-ps/application';
import type {
  AssetStore,
  DurableJobRecord,
  JobHistoryStore,
  ModelDiscoveryCache,
  ModelDiscoveryCacheRepository,
  ProviderProfile,
  ProviderProfileRepository,
  SecretStorageAdapter,
  StoredAssetRef,
  TaskRecord,
  TaskStore,
  UserModelConfig,
  UserModelConfigRepository,
} from '@imagen-ps/application';
import type { ActiveImageProfileStore } from '../../shared/ports/active-image-profile';
import { DEFAULT_APP_GENERATION_SETTINGS, normalizeAppGenerationSettings, type AppGenerationSettings, type AppGenerationSettingsStore } from '../../shared/ports/app-generation-settings';
import { normalizePromptSettings, type PromptSettings, type PromptSettingsStore } from '../../shared/ports/prompt-settings';

export type ChromeStoreName = 'profiles' | 'secrets' | 'history' | 'tasks' | 'assets' | 'appSettings' | 'modelDiscovery' | 'userModelConfigs';

export interface ChromeKeyValueBackend {
  get<T>(store: ChromeStoreName, key: string): Promise<T | undefined>;
  put<T>(store: ChromeStoreName, key: string, value: T): Promise<void>;
  delete(store: ChromeStoreName, key: string): Promise<void>;
  list<T>(store: ChromeStoreName): Promise<readonly T[]>;
  listEntries?<T>(store: ChromeStoreName): Promise<readonly ChromeStoredRecord<T>[]>;
  clear?(store?: ChromeStoreName): Promise<void>;
}

interface ChromeStoredRecord<T> {
  readonly key: string;
  readonly value: T;
}

const CHROME_DB_NAME = 'imagen-ps-chrome-runtime';
const CHROME_DB_VERSION = 4;
const CHROME_STORES: readonly ChromeStoreName[] = ['profiles', 'secrets', 'history', 'tasks', 'assets', 'appSettings', 'modelDiscovery', 'userModelConfigs'];
const GENERATION_SETTINGS_KEY = 'generation';
const PROMPT_SETTINGS_KEY = 'prompt';
const ACTIVE_IMAGE_PROFILE_KEY = 'activeImageProfile';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function openChromeDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, CHROME_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of CHROME_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'key' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
  });
}

/** 真实 Chrome runtime 使用的 IndexedDB 后端；测试仍可注入内存等价实现。 */
export function createBrowserIndexedDbBackend(options?: { readonly databaseName?: string }): ChromeKeyValueBackend {
  const database = openChromeDatabase(options?.databaseName ?? CHROME_DB_NAME);

  return {
    async get<T>(store: ChromeStoreName, key: string): Promise<T | undefined> {
      const db = await database;
      const transaction = db.transaction(store, 'readonly');
      const record = await requestResult<ChromeStoredRecord<T> | undefined>(transaction.objectStore(store).get(key));
      return record?.value;
    },
    async put<T>(store: ChromeStoreName, key: string, value: T): Promise<void> {
      const db = await database;
      const transaction = db.transaction(store, 'readwrite');
      transaction.objectStore(store).put({ key, value } satisfies ChromeStoredRecord<T>);
      await transactionDone(transaction);
    },
    async delete(store: ChromeStoreName, key: string): Promise<void> {
      const db = await database;
      const transaction = db.transaction(store, 'readwrite');
      transaction.objectStore(store).delete(key);
      await transactionDone(transaction);
    },
    async list<T>(store: ChromeStoreName): Promise<readonly T[]> {
      const db = await database;
      const transaction = db.transaction(store, 'readonly');
      const records = await requestResult<ChromeStoredRecord<T>[]>(transaction.objectStore(store).getAll());
      return records.map((record) => record.value);
    },
    async listEntries<T>(store: ChromeStoreName): Promise<readonly ChromeStoredRecord<T>[]> {
      const db = await database;
      const transaction = db.transaction(store, 'readonly');
      return requestResult<ChromeStoredRecord<T>[]>(transaction.objectStore(store).getAll());
    },
    async clear(store): Promise<void> {
      const db = await database;
      const stores = store ? [store] : [...CHROME_STORES];
      const transaction = db.transaction(stores, 'readwrite');
      for (const name of stores) {
        transaction.objectStore(name).clear();
      }
      await transactionDone(transaction);
    },
  };
}

export function createMemoryIndexedDbBackend(options?: {
  readonly initial?: Partial<Record<ChromeStoreName, readonly ChromeStoredRecord<unknown>[]>>;
}): ChromeKeyValueBackend {
  const stores: Record<ChromeStoreName, Map<string, unknown>> = {
    profiles: new Map(),
    secrets: new Map(),
    history: new Map(),
    tasks: new Map(),
    assets: new Map(),
    appSettings: new Map(),
    modelDiscovery: new Map(),
    userModelConfigs: new Map(),
  };
  for (const [store, records] of Object.entries(options?.initial ?? {}) as Array<[
    ChromeStoreName,
    readonly ChromeStoredRecord<unknown>[],
  ]>) {
    for (const record of records) {
      stores[store].set(record.key, record.value);
    }
  }
  return {
    async get<T>(store: ChromeStoreName, key: string): Promise<T | undefined> {
      return stores[store].get(key) as T | undefined;
    },
    async put(store: ChromeStoreName, key: string, value: unknown): Promise<void> {
      stores[store].set(key, value);
    },
    async delete(store: ChromeStoreName, key: string): Promise<void> {
      stores[store].delete(key);
    },
    async list<T>(store: ChromeStoreName): Promise<readonly T[]> {
      return Array.from(stores[store].values()) as T[];
    },
    async listEntries<T>(store: ChromeStoreName): Promise<readonly ChromeStoredRecord<T>[]> {
      return Array.from(stores[store].entries()).map(([key, value]) => ({
        key,
        value: value as T,
      }));
    },
    async clear(store): Promise<void> {
      if (store) {
        stores[store].clear();
        return;
      }
      for (const values of Object.values(stores)) {
        values.clear();
      }
    },
  };
}

interface AssetRecord {
  readonly bytes: ArrayBuffer;
  readonly mimeType?: string;
  readonly name?: string;
}

const ASSET_KEY_PREFIX = 'chrome-idb-asset-';

function parseAssetCounter(ref: string): number | undefined {
  if (!ref.startsWith(ASSET_KEY_PREFIX)) {
    return undefined;
  }
  const raw = Number.parseInt(ref.slice(ASSET_KEY_PREFIX.length), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/** Chrome runtime 的持久化 adapter；默认后端由 IndexedDB 提供，测试可注入等价后端。 */
export function createChromeIndexedDbStorage(options?: { readonly backend?: ChromeKeyValueBackend }): {
  readonly profiles: ProviderProfileRepository;
  readonly secrets: SecretStorageAdapter;
  readonly history: JobHistoryStore;
  readonly tasks: TaskStore;
  readonly assets: AssetStore;
  readonly modelDiscovery: ModelDiscoveryCacheRepository;
  readonly userModelConfigs: UserModelConfigRepository;
  readonly generationSettings: AppGenerationSettingsStore;
  readonly promptSettings: PromptSettingsStore;
  readonly activeImageProfile: ActiveImageProfileStore;
} {
  const backend = options?.backend ?? createBrowserIndexedDbBackend();
  let assetCounter = 0;
  let assetCounterSeeded = false;

  async function nextAssetRef(): Promise<string> {
    if (!assetCounterSeeded) {
      const storedRecords = backend.listEntries
        ? await backend.listEntries<AssetRecord>('assets')
        : [];
      for (const record of storedRecords) {
        assetCounter = Math.max(assetCounter, parseAssetCounter(record.key) ?? 0);
      }
      assetCounterSeeded = true;
    }
    assetCounter += 1;
    return `${ASSET_KEY_PREFIX}${assetCounter}`;
  }

  return {
    profiles: {
      async list(): Promise<readonly ProviderProfile[]> {
        return backend.list<ProviderProfile>('profiles');
      },
      async get(profileId): Promise<ProviderProfile | undefined> {
        return backend.get<ProviderProfile>('profiles', profileId);
      },
      async save(profile): Promise<void> {
        await backend.put('profiles', profile.profileId, profile);
      },
      async delete(profileId): Promise<void> {
        await backend.delete('profiles', profileId);
      },
    },
    secrets: {
      async getSecret(key): Promise<string | undefined> {
        return backend.get<string>('secrets', key);
      },
      async setSecret(key, value): Promise<void> {
        await backend.put('secrets', key, value);
      },
      async deleteSecret(key): Promise<void> {
        await backend.delete('secrets', key);
      },
    },
    history: {
      async put(record): Promise<void> {
        await backend.put('history', record.jobId, record);
      },
      async get(jobId): Promise<DurableJobRecord | undefined> {
        return backend.get<DurableJobRecord>('history', jobId);
      },
      async list(query): Promise<readonly DurableJobRecord[]> {
        const records = await backend.list<DurableJobRecord>('history');
        const filtered = records.filter((record) => query?.status === undefined || record.status === query.status);
        return typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
      },
      async delete(jobId): Promise<void> {
        await backend.delete('history', jobId);
      },
    },
    tasks: {
      async put(record): Promise<void> {
        assertTaskRecord(record);
        await backend.put('tasks', record.taskId, record);
      },
      async get(taskId): Promise<TaskRecord | undefined> {
        const record = await backend.get<unknown>('tasks', taskId);
        const decoded = decodeTaskRecord(record);
        return decoded.ok ? decoded.value : undefined;
      },
      async list(query): Promise<readonly TaskRecord[]> {
        const records = await backend.list<unknown>('tasks');
        const filtered = records
          .map((record) => decodeTaskRecord(record))
          .filter((result): result is { readonly ok: true; readonly value: TaskRecord } => result.ok)
          .map((result) => result.value)
          .filter((record) => query?.status === undefined || record.status === query.status)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
      },
      async delete(taskId): Promise<void> {
        await backend.delete('tasks', taskId);
      },
    },
    assets: {
      async put(bytes, meta): Promise<StoredAssetRef> {
        const ref = await nextAssetRef();
        const copy = bytes.slice(0);
        await backend.put<AssetRecord>('assets', ref, {
          bytes: copy,
          ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
          ...(meta.name !== undefined ? { name: meta.name } : {}),
        });
        return {
          kind: 'hostObject',
          ref,
          byteSize: copy.byteLength,
          ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
          ...(meta.name !== undefined ? { name: meta.name } : {}),
        };
      },
      async resolve(ref): Promise<ArrayBuffer | undefined> {
        return (await backend.get<AssetRecord>('assets', ref.ref))?.bytes.slice(0);
      },
      async delete(ref): Promise<void> {
        await backend.delete('assets', ref.ref);
      },
    },
    modelDiscovery: {
      async get(profileId): Promise<ModelDiscoveryCache | undefined> {
        return backend.get<ModelDiscoveryCache>('modelDiscovery', profileId);
      },
      async put(cache): Promise<void> {
        await backend.put('modelDiscovery', cache.profileId, cache);
      },
      async delete(profileId): Promise<void> {
        await backend.delete('modelDiscovery', profileId);
      },
    },
    userModelConfigs: {
      async list(apiFormat): Promise<readonly UserModelConfig[]> {
        const configs = await backend.list<UserModelConfig>('userModelConfigs');
        return apiFormat === undefined ? configs : configs.filter((config) => config.apiFormat === apiFormat);
      },
      async get(apiFormat, modelId): Promise<UserModelConfig | undefined> {
        return backend.get<UserModelConfig>('userModelConfigs', `${apiFormat}:${modelId}`);
      },
      async save(config): Promise<void> {
        await backend.put('userModelConfigs', `${config.apiFormat}:${config.modelId}`, config);
      },
      async delete(apiFormat, modelId): Promise<void> {
        await backend.delete('userModelConfigs', `${apiFormat}:${modelId}`);
      },
    },
    generationSettings: {
      async load(): Promise<AppGenerationSettings> {
        return normalizeAppGenerationSettings(
          await backend.get<AppGenerationSettings>('appSettings', GENERATION_SETTINGS_KEY) ?? DEFAULT_APP_GENERATION_SETTINGS,
        );
      },
      async save(settings): Promise<void> {
        await backend.put('appSettings', GENERATION_SETTINGS_KEY, normalizeAppGenerationSettings(settings));
      },
    },
    promptSettings: {
      async load(): Promise<PromptSettings | null> {
        const stored = await backend.get<PromptSettings>('appSettings', PROMPT_SETTINGS_KEY);
        return stored === undefined ? null : normalizePromptSettings(stored);
      },
      async save(settings): Promise<void> {
        await backend.put('appSettings', PROMPT_SETTINGS_KEY, normalizePromptSettings(settings));
      },
    },
    activeImageProfile: {
      async load(): Promise<string | null> {
        return await backend.get<string | null>('appSettings', ACTIVE_IMAGE_PROFILE_KEY) ?? null;
      },
      async save(profileId: string | null): Promise<void> {
        await backend.put('appSettings', ACTIVE_IMAGE_PROFILE_KEY, profileId);
      },
    },
  };
}

import type {
  AssetStore,
  DurableJobRecord,
  JobHistoryStore,
  ProviderProfile,
  ProviderProfileRepository,
  SecretStorageAdapter,
  StoredAssetRef,
} from '@imagen-ps/application';

export type ChromeStoreName = 'profiles' | 'secrets' | 'history' | 'assets';

export interface ChromeKeyValueBackend {
  get<T>(store: ChromeStoreName, key: string): Promise<T | undefined>;
  put<T>(store: ChromeStoreName, key: string, value: T): Promise<void>;
  delete(store: ChromeStoreName, key: string): Promise<void>;
  list<T>(store: ChromeStoreName): Promise<readonly T[]>;
  clear?(store?: ChromeStoreName): Promise<void>;
}

interface ChromeStoredRecord<T> {
  readonly key: string;
  readonly value: T;
}

const CHROME_DB_NAME = 'imagen-ps-chrome-runtime';
const CHROME_DB_VERSION = 1;
const CHROME_STORES: readonly ChromeStoreName[] = ['profiles', 'secrets', 'history', 'assets'];

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
    assets: new Map(),
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

/** Chrome runtime 的持久化 adapter；默认后端由 IndexedDB 提供，测试可注入等价后端。 */
export function createChromeIndexedDbStorage(options?: { readonly backend?: ChromeKeyValueBackend }): {
  readonly profiles: ProviderProfileRepository;
  readonly secrets: SecretStorageAdapter;
  readonly history: JobHistoryStore;
  readonly assets: AssetStore;
} {
  const backend = options?.backend ?? createBrowserIndexedDbBackend();
  let assetCounter = 0;

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
    assets: {
      async put(bytes, meta): Promise<StoredAssetRef> {
        const ref = `chrome-idb-asset-${++assetCounter}`;
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
  };
}

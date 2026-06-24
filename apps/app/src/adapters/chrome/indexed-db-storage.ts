import type {
  AssetStore,
  DurableJobRecord,
  JobHistoryStore,
  ProviderProfile,
  ProviderProfileRepository,
  SecretStorageAdapter,
  StoredAssetRef,
} from '@imagen-ps/application';

type StoreName = 'profiles' | 'secrets' | 'history' | 'assets';

export interface ChromeKeyValueBackend {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  list<T>(store: StoreName): Promise<readonly T[]>;
}

export function createMemoryIndexedDbBackend(): ChromeKeyValueBackend {
  const stores: Record<StoreName, Map<string, unknown>> = {
    profiles: new Map(),
    secrets: new Map(),
    history: new Map(),
    assets: new Map(),
  };
  return {
    async get<T>(store: StoreName, key: string): Promise<T | undefined> {
      return stores[store].get(key) as T | undefined;
    },
    async put(store: StoreName, key: string, value: unknown): Promise<void> {
      stores[store].set(key, value);
    },
    async delete(store: StoreName, key: string): Promise<void> {
      stores[store].delete(key);
    },
    async list<T>(store: StoreName): Promise<readonly T[]> {
      return Array.from(stores[store].values()) as T[];
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
  const backend = options?.backend ?? createMemoryIndexedDbBackend();
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

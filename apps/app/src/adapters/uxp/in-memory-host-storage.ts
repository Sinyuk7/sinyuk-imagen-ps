import { decodeTaskRecord } from '@imagen-ps/application';
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
import { createMemoryActiveImageProfileStore } from '../../shared/ports/active-image-profile';
import { createMemoryGenerationSettingsStore } from '../../shared/ports/app-generation-settings';

export { createMemoryGenerationSettingsStore as createInMemoryGenerationSettingsStore };
export { createMemoryActiveImageProfileStore as createInMemoryActiveImageProfileStore };

export function createInMemoryProviderProfileRepository(): ProviderProfileRepository {
  const profiles = new Map<string, ProviderProfile>();
  return {
    async list(): Promise<readonly ProviderProfile[]> {
      return Array.from(profiles.values());
    },
    async get(profileId: string): Promise<ProviderProfile | undefined> {
      return profiles.get(profileId);
    },
    async save(profile: ProviderProfile): Promise<void> {
      profiles.set(profile.profileId, profile);
    },
    async delete(profileId: string): Promise<void> {
      profiles.delete(profileId);
    },
  };
}

export function createInMemoryModelDiscoveryCacheRepository(): ModelDiscoveryCacheRepository {
  const caches = new Map<string, ModelDiscoveryCache>();
  return {
    async get(profileId: string): Promise<ModelDiscoveryCache | undefined> {
      return caches.get(profileId);
    },
    async put(cache: ModelDiscoveryCache): Promise<void> {
      caches.set(cache.profileId, cache);
    },
    async delete(profileId: string): Promise<void> {
      caches.delete(profileId);
    },
  };
}

function userModelConfigKey(apiFormat: string, modelId: string): string {
  return `${apiFormat}:${modelId}`;
}

export function createInMemoryUserModelConfigRepository(): UserModelConfigRepository {
  const configs = new Map<string, UserModelConfig>();
  return {
    async list(apiFormat): Promise<readonly UserModelConfig[]> {
      const values = Array.from(configs.values());
      return apiFormat === undefined ? values : values.filter((config) => config.apiFormat === apiFormat);
    },
    async get(apiFormat, modelId): Promise<UserModelConfig | undefined> {
      return configs.get(userModelConfigKey(apiFormat, modelId));
    },
    async save(config): Promise<void> {
      configs.set(userModelConfigKey(config.apiFormat, config.modelId), config);
    },
    async delete(apiFormat, modelId): Promise<void> {
      configs.delete(userModelConfigKey(apiFormat, modelId));
    },
  };
}

export function createInMemorySecretStorageAdapter(): SecretStorageAdapter {
  const secrets = new Map<string, string>();
  return {
    async getSecret(key: string): Promise<string | undefined> {
      return secrets.get(key);
    },
    async setSecret(key: string, value: string): Promise<void> {
      secrets.set(key, value);
    },
    async deleteSecret(key: string): Promise<void> {
      secrets.delete(key);
    },
  };
}

export function createInMemoryJobHistoryStore(): JobHistoryStore {
  const records = new Map<string, DurableJobRecord>();
  return {
    async put(record: DurableJobRecord): Promise<void> {
      records.set(record.jobId, record);
    },
    async get(jobId: string): Promise<DurableJobRecord | undefined> {
      return records.get(jobId);
    },
    async list(query?: { readonly limit?: number; readonly status?: string }): Promise<readonly DurableJobRecord[]> {
      const values = Array.from(records.values())
        .filter((record) => query?.status === undefined || record.status === query.status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return typeof query?.limit === 'number' ? values.slice(0, query.limit) : values;
    },
    async delete(jobId: string): Promise<void> {
      records.delete(jobId);
    },
  };
}

export function createInMemoryTaskStore(): TaskStore {
  const records = new Map<string, TaskRecord>();
  return {
    async put(record: TaskRecord): Promise<void> {
      records.set(record.taskId, record);
    },
    async get(taskId: string): Promise<TaskRecord | undefined> {
      return records.get(taskId);
    },
    async list(query?: { readonly limit?: number; readonly status?: string }): Promise<readonly TaskRecord[]> {
      const values = Array.from(records.values())
        .map((record) => decodeTaskRecord(record))
        .filter((result): result is { readonly ok: true; readonly value: TaskRecord } => result.ok)
        .map((result) => result.value)
        .filter((record) => query?.status === undefined || record.status === query.status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return typeof query?.limit === 'number' ? values.slice(0, query.limit) : values;
    },
    async delete(taskId: string): Promise<void> {
      records.delete(taskId);
    },
  };
}

export function createInMemoryAssetStore(): AssetStore {
  const assets = new Map<string, ArrayBuffer>();
  let counter = 0;
  return {
    async put(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string }): Promise<StoredAssetRef> {
      const ref = `memory-asset-${++counter}`;
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(new Uint8Array(bytes));
      assets.set(ref, copy.buffer);
      return {
        kind: 'hostObject',
        ref,
        ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
        ...(meta.name !== undefined ? { name: meta.name } : {}),
        byteSize: bytes.byteLength,
      };
    },
    async resolve(ref: StoredAssetRef): Promise<ArrayBuffer | undefined> {
      return assets.get(ref.ref);
    },
    async delete(ref: StoredAssetRef): Promise<void> {
      assets.delete(ref.ref);
    },
  };
}

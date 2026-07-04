import type {
  AssetStore,
  DurableJobRecord,
  JobHistoryStore,
  ProviderProfile,
  ProviderProfileRepository,
  SecretStorageAdapter,
  StoredAssetRef,
} from '@imagen-ps/application';
import { createMemoryActiveImageProfileStore, type ActiveImageProfileStore } from '../../shared/ports/active-image-profile';
import { createMemoryGenerationSettingsStore, type AppGenerationSettingsStore } from '../../shared/ports/app-generation-settings';
import { createMemoryPromptSettingsStore, type PromptSettingsStore } from '../../shared/ports/prompt-settings';

/**
 * Slice 0 的浏览器内存 adapter 只用于证明 application command facade 可在
 * Chrome bundle 中初始化；持久化 IndexedDB adapter 会在后续 slice 接管。
 */
export function createChromeFeasibilityStorage(): {
  readonly profiles: ProviderProfileRepository;
  readonly secrets: SecretStorageAdapter;
  readonly history: JobHistoryStore;
  readonly assets: AssetStore;
  readonly generationSettings: AppGenerationSettingsStore;
  readonly promptSettings: PromptSettingsStore;
  readonly activeImageProfile: ActiveImageProfileStore;
} {
  const profiles = new Map<string, ProviderProfile>();
  const secrets = new Map<string, string>();
  const history = new Map<string, DurableJobRecord>();
  const assets = new Map<string, ArrayBuffer>();
  let assetCounter = 0;

  return {
    profiles: {
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
    },
    secrets: {
      async getSecret(key: string): Promise<string | undefined> {
        return secrets.get(key);
      },
      async setSecret(key: string, value: string): Promise<void> {
        secrets.set(key, value);
      },
      async deleteSecret(key: string): Promise<void> {
        secrets.delete(key);
      },
    },
    history: {
      async put(record: DurableJobRecord): Promise<void> {
        history.set(record.jobId, record);
      },
      async get(jobId: string): Promise<DurableJobRecord | undefined> {
        return history.get(jobId);
      },
      async list(query?: { readonly limit?: number; readonly status?: string }): Promise<readonly DurableJobRecord[]> {
        const records = Array.from(history.values()).filter((record) => query?.status === undefined || record.status === query.status);
        return typeof query?.limit === 'number' ? records.slice(0, query.limit) : records;
      },
      async delete(jobId: string): Promise<void> {
        history.delete(jobId);
      },
    },
    assets: {
      async put(bytes: ArrayBuffer, meta: { readonly mimeType?: string; readonly name?: string }): Promise<StoredAssetRef> {
        const ref = `chrome-memory-asset-${++assetCounter}`;
        const copy = bytes.slice(0);
        assets.set(ref, copy);
        return {
          kind: 'hostObject',
          ref,
          byteSize: copy.byteLength,
          ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
          ...(meta.name !== undefined ? { name: meta.name } : {}),
        };
      },
      async resolve(ref: StoredAssetRef): Promise<ArrayBuffer | undefined> {
        return assets.get(ref.ref)?.slice(0);
      },
      async delete(ref: StoredAssetRef): Promise<void> {
        assets.delete(ref.ref);
      },
    },
    generationSettings: createMemoryGenerationSettingsStore(),
    promptSettings: createMemoryPromptSettingsStore(),
    activeImageProfile: createMemoryActiveImageProfileStore(),
  };
}

import type {
  AssetStore,
  CatalogParameterPreference,
  CatalogParameterPreferenceRepository,
  DurableJobRecord,
  JobHistoryStore,
  ProviderAccount,
  ProviderAccountRepository,
  SecretStorageAdapter,
} from '@imagen-ps/application';
import { createMemoryGenerationSettingsStore, type AppGenerationSettingsStore } from '../../shared/ports/app-generation-settings';
import { createMemoryPromptSettingsStore, type PromptSettingsStore } from '../../shared/ports/prompt-settings';

/** Chrome harness 的固定 provider 内存存储。 */
export function createChromeFeasibilityStorage(): {
  readonly providerAccounts: ProviderAccountRepository;
  readonly catalogParameterPreferences: CatalogParameterPreferenceRepository;
  readonly secrets: SecretStorageAdapter;
  readonly history: JobHistoryStore;
  readonly assets: AssetStore;
  readonly generationSettings: AppGenerationSettingsStore;
  readonly promptSettings: PromptSettingsStore;
} {
  const accounts = new Map<string, ProviderAccount>();
  const preferences = new Map<string, CatalogParameterPreference>();
  const secrets = new Map<string, string>();
  const history = new Map<string, DurableJobRecord>();
  const assets = new Map<string, ArrayBuffer>();
  let assetCounter = 0;
  return {
    providerAccounts: {
      async list() { return Array.from(accounts.values()); },
      async get(providerId) { return accounts.get(providerId); },
      async save(account) { accounts.set(account.providerId, account); },
      async delete(providerId) { accounts.delete(providerId); },
    },
    catalogParameterPreferences: {
      async get(providerId, modelId) { return preferences.get(`${providerId}:${modelId}`); },
      async save(preference) { preferences.set(`${preference.providerId}:${preference.modelId}`, preference); },
      async delete(providerId, modelId) { preferences.delete(`${providerId}:${modelId}`); },
    },
    secrets: {
      async getSecret(key) { return secrets.get(key); },
      async setSecret(key, value) { secrets.set(key, value); },
      async deleteSecret(key) { secrets.delete(key); },
    },
    history: {
      async put(record) { history.set(record.jobId, record); },
      async get(jobId) { return history.get(jobId); },
      async list(query) {
        const records = Array.from(history.values()).filter((record) => query?.status === undefined || record.status === query.status);
        return typeof query?.limit === 'number' ? records.slice(0, query.limit) : records;
      },
      async delete(jobId) { history.delete(jobId); },
    },
    assets: {
      async put(bytes, meta) {
        const ref = `chrome-memory-asset-${++assetCounter}`;
        const copy = bytes.slice(0);
        assets.set(ref, copy);
        return { kind: 'hostObject', ref, byteSize: copy.byteLength, ...(meta.mimeType ? { mimeType: meta.mimeType } : {}), ...(meta.name ? { name: meta.name } : {}) };
      },
      async resolve(ref) { return assets.get(ref.ref)?.slice(0); },
      async delete(ref) { assets.delete(ref.ref); },
    },
    generationSettings: createMemoryGenerationSettingsStore(),
    promptSettings: createMemoryPromptSettingsStore(),
  };
}

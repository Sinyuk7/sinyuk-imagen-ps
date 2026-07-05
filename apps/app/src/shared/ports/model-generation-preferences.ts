import type {
  ModelGenerationPreference,
  ModelGenerationPreferenceKey,
  ModelGenerationPreferenceRepository,
} from '@imagen-ps/application';

export type AppModelGenerationPreferenceRepository = ModelGenerationPreferenceRepository;

export function modelGenerationPreferenceKey(key: ModelGenerationPreferenceKey): string {
  return `${key.profileId}:${key.apiFormat}:${key.modelId}:${key.operation}`;
}

export function createMemoryModelGenerationPreferenceRepository(
  initial: readonly ModelGenerationPreference[] = [],
): AppModelGenerationPreferenceRepository {
  const store = new Map(initial.map((preference) => [modelGenerationPreferenceKey(preference), preference]));
  return {
    async get(key): Promise<ModelGenerationPreference | undefined> {
      return store.get(modelGenerationPreferenceKey(key));
    },
    async save(preference): Promise<void> {
      store.set(modelGenerationPreferenceKey(preference), preference);
    },
    async delete(key): Promise<void> {
      store.delete(modelGenerationPreferenceKey(key));
    },
  };
}

export type AppProviderInputSizePreset = '1k' | '2k' | '4k';

export interface AppGenerationSettings {
  readonly providerInputSizePreset: AppProviderInputSizePreset;
  readonly settingsOnboardingSeenVersion?: number;
}

export interface AppGenerationSettingsStore {
  load(): Promise<AppGenerationSettings>;
  save(settings: AppGenerationSettings): Promise<void>;
}

export const DEFAULT_APP_GENERATION_SETTINGS = {
  providerInputSizePreset: '1k',
} as const satisfies AppGenerationSettings;

const PROVIDER_INPUT_SIZE_PRESETS = new Set<AppProviderInputSizePreset>(['1k', '2k', '4k']);

function normalizeSettingsOnboardingSeenVersion(input: unknown): number | undefined {
  return Number.isSafeInteger(input) && Number(input) > 0
    ? Number(input)
    : undefined;
}

export function providerInputSizePresetToMaxSide(preset: AppProviderInputSizePreset): number {
  switch (preset) {
    case '1k':
      return 1024;
    case '2k':
      return 2048;
    case '4k':
      return 4096;
  }
}

export function normalizeAppGenerationSettings(input: unknown): AppGenerationSettings {
  const value = typeof input === 'object' && input !== null ? input as Partial<AppGenerationSettings> : {};
  const settingsOnboardingSeenVersion = normalizeSettingsOnboardingSeenVersion(value.settingsOnboardingSeenVersion);
  return {
    providerInputSizePreset: PROVIDER_INPUT_SIZE_PRESETS.has(value.providerInputSizePreset as AppProviderInputSizePreset)
      ? value.providerInputSizePreset as AppProviderInputSizePreset
      : DEFAULT_APP_GENERATION_SETTINGS.providerInputSizePreset,
    ...(settingsOnboardingSeenVersion === undefined ? {} : { settingsOnboardingSeenVersion }),
  };
}

export function createMemoryGenerationSettingsStore(
  initial?: Partial<AppGenerationSettings>,
): AppGenerationSettingsStore {
  let current = normalizeAppGenerationSettings(initial);
  return {
    async load(): Promise<AppGenerationSettings> {
      return current;
    },
    async save(settings): Promise<void> {
      current = normalizeAppGenerationSettings(settings);
    },
  };
}

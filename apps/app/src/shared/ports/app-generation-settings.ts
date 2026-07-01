export type AppOutputSizePreset = '512' | '1k' | '2k' | '4k';
export type AppOutputFormat = 'png' | 'jpeg' | 'webp';
export type AppAspectRatio = 'auto' | '1:1' | '16:9' | '9:16';
export type AppProviderInputSizePreset = '1k' | '2k' | '4k';

export interface AppGenerationSettings {
  readonly outputSizePreset: AppOutputSizePreset;
  readonly outputFormat: AppOutputFormat;
  readonly aspectRatio: AppAspectRatio;
  readonly providerInputSizePreset: AppProviderInputSizePreset;
}

export interface AppGenerationSettingsStore {
  load(): Promise<AppGenerationSettings>;
  save(settings: AppGenerationSettings): Promise<void>;
}

export const DEFAULT_APP_GENERATION_SETTINGS = {
  outputSizePreset: '2k',
  outputFormat: 'png',
  aspectRatio: 'auto',
  providerInputSizePreset: '1k',
} as const satisfies AppGenerationSettings;

const OUTPUT_SIZE_PRESETS = new Set<AppOutputSizePreset>(['512', '1k', '2k', '4k']);
const OUTPUT_FORMATS = new Set<AppOutputFormat>(['png', 'jpeg', 'webp']);
const ASPECT_RATIOS = new Set<AppAspectRatio>(['auto', '1:1', '16:9', '9:16']);
const PROVIDER_INPUT_SIZE_PRESETS = new Set<AppProviderInputSizePreset>(['1k', '2k', '4k']);

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
  return {
    outputSizePreset: OUTPUT_SIZE_PRESETS.has(value.outputSizePreset as AppOutputSizePreset)
      ? value.outputSizePreset as AppOutputSizePreset
      : DEFAULT_APP_GENERATION_SETTINGS.outputSizePreset,
    outputFormat: OUTPUT_FORMATS.has(value.outputFormat as AppOutputFormat)
      ? value.outputFormat as AppOutputFormat
      : DEFAULT_APP_GENERATION_SETTINGS.outputFormat,
    aspectRatio: ASPECT_RATIOS.has(value.aspectRatio as AppAspectRatio)
      ? value.aspectRatio as AppAspectRatio
      : DEFAULT_APP_GENERATION_SETTINGS.aspectRatio,
    providerInputSizePreset: PROVIDER_INPUT_SIZE_PRESETS.has(value.providerInputSizePreset as AppProviderInputSizePreset)
      ? value.providerInputSizePreset as AppProviderInputSizePreset
      : DEFAULT_APP_GENERATION_SETTINGS.providerInputSizePreset,
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

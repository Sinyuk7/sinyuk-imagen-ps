export type AppOutputSizePreset = '512' | '1k' | '2k' | '4k';
export type AppOutputFormat = 'png' | 'jpeg' | 'webp';
export type AppAspectRatio = 'auto' | '1:1' | '16:9' | '9:16';

export interface AppGenerationSettings {
  readonly outputSizePreset: AppOutputSizePreset;
  readonly outputFormat: AppOutputFormat;
  readonly aspectRatio: AppAspectRatio;
  readonly providerInputMaxSide: number;
  readonly showProviderResponseText: boolean;
}

export interface AppGenerationSettingsStore {
  load(): Promise<AppGenerationSettings>;
  save(settings: AppGenerationSettings): Promise<void>;
}

export const DEFAULT_APP_GENERATION_SETTINGS = {
  outputSizePreset: '2k',
  outputFormat: 'png',
  aspectRatio: 'auto',
  providerInputMaxSide: 2048,
  showProviderResponseText: true,
} as const satisfies AppGenerationSettings;

const OUTPUT_SIZE_PRESETS = new Set<AppOutputSizePreset>(['512', '1k', '2k', '4k']);
const OUTPUT_FORMATS = new Set<AppOutputFormat>(['png', 'jpeg', 'webp']);
const ASPECT_RATIOS = new Set<AppAspectRatio>(['auto', '1:1', '16:9', '9:16']);

function readInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

export function normalizeAppGenerationSettings(input: unknown): AppGenerationSettings {
  const value = typeof input === 'object' && input !== null ? input as Partial<AppGenerationSettings> : {};
  const providerInputMaxSide = readInteger(value.providerInputMaxSide);
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
    providerInputMaxSide: providerInputMaxSide ?? DEFAULT_APP_GENERATION_SETTINGS.providerInputMaxSide,
    showProviderResponseText:
      typeof value.showProviderResponseText === 'boolean'
        ? value.showProviderResponseText
        : DEFAULT_APP_GENERATION_SETTINGS.showProviderResponseText,
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

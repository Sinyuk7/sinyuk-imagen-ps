export type PromptPresetMode = 'prepend' | 'append' | 'replace';

export interface PromptPreset {
  readonly id: string;
  readonly name: string;
  readonly mode: PromptPresetMode;
  readonly content: string;
}

export interface PromptSettings {
  readonly optimization: {
    readonly profileId: string | null;
    readonly template: string;
  };
  readonly presets: {
    readonly selectedId: string | null;
    readonly items: readonly PromptPreset[];
  };
}

export interface PromptSettingsStore {
  load(): Promise<PromptSettings | null>;
  save(settings: PromptSettings): Promise<void>;
}

export const DEFAULT_PROMPT_OPTIMIZATION_TEMPLATE = 'Improve this image prompt while preserving the user intent:\n\n{prompt}';

export const DEFAULT_CINEMATIC_PROMPT_PRESET: PromptPreset = {
  id: 'preset-cinematic',
  name: 'Cinematic',
  mode: 'append',
  content: 'cinematic lighting, rich detail, cohesive composition',
};

export const DEFAULT_PROMPT_SETTINGS = {
  optimization: {
    profileId: null,
    template: DEFAULT_PROMPT_OPTIMIZATION_TEMPLATE,
  },
  presets: {
    selectedId: null,
    items: [DEFAULT_CINEMATIC_PROMPT_PRESET],
  },
} as const satisfies PromptSettings;

const PROMPT_PRESET_MODES = new Set<PromptPresetMode>(['prepend', 'append', 'replace']);

function objectValue(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizePreset(input: unknown, index: number): PromptPreset {
  const value = objectValue(input);
  const mode = PROMPT_PRESET_MODES.has(value.mode as PromptPresetMode)
    ? value.mode as PromptPresetMode
    : 'append';
  return {
    id: stringOrDefault(value.id, `preset-${index + 1}`),
    name: stringOrDefault(value.name, ''),
    mode,
    content: stringOrDefault(value.content, ''),
  };
}

export function normalizePromptSettings(input: unknown): PromptSettings {
  const value = objectValue(input);
  const optimization = objectValue(value.optimization);
  const presets = objectValue(value.presets);
  const items = Array.isArray(presets.items)
    ? presets.items.map(normalizePreset)
    : [];
  const selectedId = nullableString(presets.selectedId);
  return {
    optimization: {
      profileId: nullableString(optimization.profileId),
      template: stringOrDefault(optimization.template, DEFAULT_PROMPT_SETTINGS.optimization.template),
    },
    presets: {
      selectedId: selectedId && items.some((item) => item.id === selectedId) ? selectedId : null,
      items,
    },
  };
}

export function createDefaultPromptSettings(): PromptSettings {
  return {
    optimization: { ...DEFAULT_PROMPT_SETTINGS.optimization },
    presets: {
      selectedId: DEFAULT_PROMPT_SETTINGS.presets.selectedId,
      items: DEFAULT_PROMPT_SETTINGS.presets.items.map((item) => ({ ...item })),
    },
  };
}

export function createMemoryPromptSettingsStore(initial?: PromptSettings | null): PromptSettingsStore {
  let current = initial === undefined ? null : initial === null ? null : normalizePromptSettings(initial);
  return {
    async load(): Promise<PromptSettings | null> {
      return current === null ? null : normalizePromptSettings(current);
    },
    async save(settings): Promise<void> {
      current = normalizePromptSettings(settings);
    },
  };
}

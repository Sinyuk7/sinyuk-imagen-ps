import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
type PromptProvider = { readonly providerId: string; readonly displayName: string };
import type { AppServices } from '../../ports/app-services';
import {
  createDefaultPromptSettings,
  normalizePromptSettings,
  type PromptPreset,
  type PromptPresetMode,
  type PromptSettings,
} from '../../ports/prompt-settings';

export type PromptSettingsSaveState = 'idle' | 'saving' | 'saved' | 'error';
export type PromptOptimizationActivationState = 'active' | 'no-provider' | 'invalid-template' | 'missing-provider';
export type PromptPresetEffectState = 'none' | 'active' | 'invalid-content';

export interface PromptPresetView {
  readonly preset: PromptPreset;
  readonly selected: boolean;
  readonly contentValid: boolean;
  readonly effectState: PromptPresetEffectState;
}

export interface PromptSettingsState {
  readonly settings: PromptSettings;
  readonly providers: readonly PromptProvider[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: PromptSettingsSaveState;
  readonly templateValid: boolean;
  readonly activationState: PromptOptimizationActivationState;
  readonly selectedPreset: PromptPreset | null;
  readonly presetViews: readonly PromptPresetView[];
  readonly save: (settings: PromptSettings) => Promise<void>;
  readonly updateOptimization: (optimization: PromptSettings['optimization']) => Promise<void>;
  readonly selectPreset: (presetId: string | null) => Promise<void>;
  readonly upsertPreset: (preset: PromptPreset) => Promise<void>;
  readonly deletePreset: (presetId: string) => Promise<void>;
  readonly reload: () => Promise<void>;
}

export function countPromptPlaceholders(template: string): number {
  return template.match(/\{prompt\}/g)?.length ?? 0;
}

export function hasExactlyOnePromptPlaceholder(template: string): boolean {
  return countPromptPlaceholders(template) === 1;
}

export function promptPresetContentValid(mode: PromptPresetMode, content: string): boolean {
  return mode === 'replace' ? hasExactlyOnePromptPlaceholder(content) : true;
}

export function derivePromptOptimizationActivationState(
  settings: PromptSettings,
  providers: readonly PromptProvider[],
): PromptOptimizationActivationState {
  if (!hasExactlyOnePromptPlaceholder(settings.optimization.template)) {
    return 'invalid-template';
  }
  if (settings.optimization.providerId === null) {
    return 'no-provider';
  }
  return providers.some((provider) => provider.providerId === settings.optimization.providerId)
    ? 'active'
    : 'missing-provider';
}

function createPresetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `preset-${crypto.randomUUID()}`;
  }
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPromptPresetDraft(): PromptPreset {
  return {
    id: createPresetId(),
    name: '',
    mode: 'append',
    content: '',
  };
}

export function usePromptSettings(services: AppServices): PromptSettingsState {
  const [settings, setSettings] = useState<PromptSettings>(createDefaultPromptSettings);
  const [providers, setProviders] = useState<readonly PromptProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<PromptSettingsSaveState>('idle');
  const initializedRef = useRef(false);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persist = useCallback(async (next: PromptSettings) => {
    const normalized = normalizePromptSettings(next);
    settingsRef.current = normalized;
    setSettings(normalized);
    setSaveState('saving');
    try {
      await services.promptSettings.save(normalized);
      setError(null);
      setSaveState('saved');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setSaveState('error');
    }
  }, [services.promptSettings]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await services.promptSettings.load();
      const root = stored === null ? createDefaultPromptSettings() : normalizePromptSettings(stored);
      if (stored === null && !initializedRef.current) {
        initializedRef.current = true;
        await services.promptSettings.save(root);
      }

      const nextProviders = ([{ providerId: 'grsai', displayName: 'GRSAI' }, { providerId: 'runninghub', displayName: 'RunningHub' }] );
      setProviders(nextProviders);
      settingsRef.current = root;
      setSettings(root);
      setError(null);
      setSaveState('idle');

      const providerId = root.optimization.providerId;
      if (providerId !== null && !nextProviders.some((provider: any) => provider.providerId === providerId)) {
        const repaired = {
          ...root,
          optimization: { ...root.optimization, providerId: null },
        };
        window.setTimeout(() => {
          void services.promptSettings.save(repaired)
            .then(() => {
              settingsRef.current = repaired;
              setSettings(repaired);
            })
            .catch((nextError) => {
              setError(nextError instanceof Error ? nextError.message : String(nextError));
              setSaveState('error');
            });
        }, 0);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setSaveState('error');
    } finally {
      setLoading(false);
    }
  }, [services.commands, services.promptSettings]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const templateValid = hasExactlyOnePromptPlaceholder(settings.optimization.template);
  const activationState = derivePromptOptimizationActivationState(settings, providers);
  const selectedPreset = settings.presets.items.find((preset) => preset.id === settings.presets.selectedId) ?? null;
  const presetViews = useMemo(() => settings.presets.items.map((preset) => {
    const selected = preset.id === settings.presets.selectedId;
    const contentValid = promptPresetContentValid(preset.mode, preset.content);
    return {
      preset,
      selected,
      contentValid,
      effectState: selected ? contentValid ? 'active' : 'invalid-content' : 'none',
    } satisfies PromptPresetView;
  }), [settings.presets.items, settings.presets.selectedId]);

  const updateOptimization = useCallback(async (optimization: PromptSettings['optimization']) => {
    await persist({ ...settingsRef.current, optimization });
  }, [persist]);

  const selectPreset = useCallback(async (presetId: string | null) => {
    const current = settingsRef.current;
    const nextSelectedId = presetId && current.presets.items.some((preset) => preset.id === presetId) ? presetId : null;
    await persist({
      ...current,
      presets: { ...current.presets, selectedId: nextSelectedId },
    });
  }, [persist]);

  const upsertPreset = useCallback(async (preset: PromptPreset) => {
    const current = settingsRef.current;
    const exists = current.presets.items.some((item) => item.id === preset.id);
    const items = exists
      ? current.presets.items.map((item) => (item.id === preset.id ? preset : item))
      : [...current.presets.items, preset];
    await persist({
      ...current,
      presets: {
        selectedId: current.presets.selectedId && items.some((item) => item.id === current.presets.selectedId)
          ? current.presets.selectedId
          : null,
        items,
      },
    });
  }, [persist]);

  const deletePreset = useCallback(async (presetId: string) => {
    const current = settingsRef.current;
    const items = current.presets.items.filter((preset) => preset.id !== presetId);
    await persist({
      ...current,
      presets: {
        selectedId: current.presets.selectedId === presetId ? null : current.presets.selectedId,
        items,
      },
    });
  }, [persist]);

  return {
    providers,
    settings,
    loading,
    error,
    saveState,
    templateValid,
    activationState,
    selectedPreset,
    presetViews,
    save: persist,
    updateOptimization,
    selectPreset,
    upsertPreset,
    deletePreset,
    reload,
  };
}

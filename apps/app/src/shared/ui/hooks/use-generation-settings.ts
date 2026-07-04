import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppServices } from '../../ports/app-services';
import {
  DEFAULT_APP_GENERATION_SETTINGS,
  normalizeAppGenerationSettings,
  type AppGenerationSettings,
} from '../../ports/app-generation-settings';

export type GenerationSettingsSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface GenerationSettingsState {
  readonly settings: AppGenerationSettings;
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: GenerationSettingsSaveState;
  readonly save: (settings: AppGenerationSettings) => Promise<void>;
  readonly reload: () => Promise<void>;
}

export function useGenerationSettings(services: AppServices): GenerationSettingsState {
  const [settings, setSettings] = useState<AppGenerationSettings>(DEFAULT_APP_GENERATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<GenerationSettingsSaveState>('idle');
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const queuedSettingsRef = useRef<AppGenerationSettings | null>(null);
  const lastRequestedSettingsRef = useRef<AppGenerationSettings>(DEFAULT_APP_GENERATION_SETTINGS);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = normalizeAppGenerationSettings(await services.generationSettings.load());
      setSettings(loaded);
      lastRequestedSettingsRef.current = loaded;
      setError(null);
      setSaveState('idle');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setSettings(DEFAULT_APP_GENERATION_SETTINGS);
      lastRequestedSettingsRef.current = DEFAULT_APP_GENERATION_SETTINGS;
      setSaveState('error');
    } finally {
      setLoading(false);
    }
  }, [services.generationSettings]);

  const flushSaveQueue = useCallback(async (): Promise<void> => {
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
      return;
    }

    const next = queuedSettingsRef.current;
    if (!next) {
      return;
    }

    queuedSettingsRef.current = null;
    setSaveState('saving');

    const task = (async () => {
      try {
        await services.generationSettings.save(next);
        setError(null);
        setSaveState('saved');
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : String(nextError);
        setError(message);
        setSaveState('error');
      } finally {
        saveInFlightRef.current = null;
      }
    })();

    saveInFlightRef.current = task;
    await task;

    if (queuedSettingsRef.current && queuedSettingsRef.current !== next) {
      await flushSaveQueue();
    }
  }, [services.generationSettings]);

  const save = useCallback(async (next: AppGenerationSettings) => {
    const normalized = normalizeAppGenerationSettings(next);
    lastRequestedSettingsRef.current = normalized;
    queuedSettingsRef.current = normalized;
    setSettings(normalized);
    setSaveState('saving');
    await flushSaveQueue();
    if (queuedSettingsRef.current === null && lastRequestedSettingsRef.current === normalized) {
      return;
    }
  }, [flushSaveQueue]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, loading, error, saveState, save, reload };
}

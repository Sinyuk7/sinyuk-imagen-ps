import { useCallback, useEffect, useState } from 'react';
import type { AppServices } from '../../ports/app-services';
import {
  DEFAULT_APP_GENERATION_SETTINGS,
  normalizeAppGenerationSettings,
  type AppGenerationSettings,
} from '../../ports/app-generation-settings';

export interface GenerationSettingsState {
  readonly settings: AppGenerationSettings;
  readonly loading: boolean;
  readonly error: string | null;
  readonly save: (settings: AppGenerationSettings) => Promise<void>;
  readonly reload: () => Promise<void>;
}

export function useGenerationSettings(services: AppServices): GenerationSettingsState {
  const [settings, setSettings] = useState<AppGenerationSettings>(DEFAULT_APP_GENERATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(normalizeAppGenerationSettings(await services.generationSettings.load()));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setSettings(DEFAULT_APP_GENERATION_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, [services.generationSettings]);

  const save = useCallback(async (next: AppGenerationSettings) => {
    const normalized = normalizeAppGenerationSettings(next);
    await services.generationSettings.save(normalized);
    setSettings(normalized);
    setError(null);
  }, [services.generationSettings]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, loading, error, save, reload };
}

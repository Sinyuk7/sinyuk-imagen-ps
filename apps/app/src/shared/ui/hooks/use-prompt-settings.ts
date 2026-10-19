import { useCallback, useEffect, useState } from 'react';
import type { AppServices } from '../../ports/app-services';
import { createDefaultPromptSettings, normalizePromptSettings, type PromptSettings, type PromptTemplate } from '../../ports/prompt-settings';

export interface PromptSettingsState {
  readonly settings: PromptSettings;
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: 'idle' | 'saving' | 'saved' | 'error';
  readonly save: (settings: PromptSettings) => Promise<void>;
  readonly upsertTemplate: (template: PromptTemplate) => Promise<void>;
  readonly deleteTemplate: (templateId: string) => Promise<void>;
}

export function usePromptSettings(services: AppServices): PromptSettingsState {
  const [settings, setSettings] = useState(createDefaultPromptSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<PromptSettingsState['saveState']>('idle');
  const persist = useCallback(async (value: PromptSettings) => {
    const next = normalizePromptSettings(value);
    setSettings(next);
    setSaveState('saving');
    try { await services.promptSettings.save(next); setError(null); setSaveState('saved'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setSaveState('error'); }
  }, [services.promptSettings]);
  useEffect(() => {
    let active = true;
    void services.promptSettings.load().then((stored) => {
      if (!active) return;
      const next = stored ? normalizePromptSettings(stored) : createDefaultPromptSettings();
      setSettings(next);
      if (!stored) void services.promptSettings.save(next);
      setLoading(false);
    }).catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : String(cause)); setLoading(false); } });
    return () => { active = false; };
  }, [services.promptSettings]);
  const upsertTemplate = useCallback(async (template: PromptTemplate) => {
    const templates = settings.templates.some((item) => item.id === template.id)
      ? settings.templates.map((item) => item.id === template.id ? template : item)
      : [...settings.templates, template];
    await persist({ ...settings, templates, selectedTemplateId: template.id });
  }, [persist, settings]);
  const deleteTemplate = useCallback(async (templateId: string) => {
    if (settings.templates.length <= 1) return;
    const templates = settings.templates.filter((item) => item.id !== templateId);
    await persist({ ...settings, templates, selectedTemplateId: settings.selectedTemplateId === templateId ? templates[0]!.id : settings.selectedTemplateId });
  }, [persist, settings]);
  return { settings, loading, error, saveState, save: persist, upsertTemplate, deleteTemplate };
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AppServicesProvider } from '../ports/app-services-context';
import type { AppServices } from '../ports/app-services';
import type { LayerInfo } from '../ports/host-port';
import type { ProviderProfile } from '@imagen-ps/application';
import type { SupportedLocale } from '../domain/locale';
import type { PluginAppModel } from '../domain/plugin-app-model';
import { useConversation } from './hooks/use-conversation';
import { useComposerDraft } from './hooks/use-composer-draft';
import { useImagenSession } from './hooks/use-imagen-session';
import { useGenerationSettings } from './hooks/use-generation-settings';
import { useModelGenerationSettings } from './hooks/use-model-generation-settings';
import { usePromptSettings } from './hooks/use-prompt-settings';
import { useJobHistory } from './hooks/use-job-history';
import { useProfileModels, useProviderProfiles } from './hooks/use-provider-settings';
import { MainPage } from './pages/main-page';
import { HistoryPage } from './pages/history-page';
import { SettingsPage } from './pages/settings-page';
import { SettingsAddPage } from './pages/settings-add-page';
import { SettingsDetailPage } from './pages/settings-detail-page';
import { GlobalGenerationSettingsPage } from './pages/global-generation-settings-page';
import { ModelConfigurationPage } from './pages/model-configuration-page';
import { PromptSettingsPage } from './pages/prompt-settings-page';
import { PromptPresetDetailPage } from './pages/prompt-preset-detail-page';
import { ToastHost, ToastProvider, useToast } from './components/toast-host';
import { PopupLayerProvider, PopupLayerRoot } from './components/popup-layer';
import { I18nProvider, useI18n } from './i18n/i18n-context';
import { ensurePanelCss } from './panel-bootstrap';
import { placeTaskOutputOnCanvas, saveTaskOutputToFile } from '../domain/task-actions';
import type { TaskRecord } from '@imagen-ps/application';
import { MotionPageFrame } from './components/motion-ui';
import { mainSelectableModels, type UiModelInfo } from './model-info';

export interface AppShellHost {
  readonly app: PluginAppModel;
  readonly locale: SupportedLocale;
  readonly services: AppServices;
  dispose(): void;
}

export interface AppShellProps {
  readonly host: AppShellHost;
}

type View =
  | 'main'
  | 'history'
  | 'settings'
  | 'settings-add'
  | 'settings-detail'
  | 'global-generation-settings'
  | 'model-configuration'
  | 'prompt-settings'
  | 'prompt-preset-detail';
type AppTheme = 'dark' | 'light';
type AppThemeOverride = AppTheme | undefined;
type PanelWidthMode = 'compact' | 'regular' | 'wide';
type PanelHeightMode = 'short' | 'normal';

const PANEL_COMPACT_MAX_WIDTH = 339;
const PANEL_WIDE_MIN_WIDTH = 520;
const PANEL_SHORT_MAX_HEIGHT = 459;

/**
 * 读取 Chrome harness 的显式主题覆盖。
 *
 * Photoshop UXP 运行时不写 `data-app-theme`，让 `@media
 * (prefers-color-scheme)` 与 `--uxp-host-*` 变量直接跟随宿主主题。
 * `data-app-theme` 只服务 Chrome 截图/测试入口，避免覆盖 UXP 动态 token。
 */
function readThemeParam(): string | null {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('theme');
}

function readThemeOverride(): AppThemeOverride {
  const params = readThemeParam();
  if (params === 'light' || params === 'dark') {
    return params;
  }
  return undefined;
}

function classifyPanelWidthMode(width: number): PanelWidthMode {
  if (width <= PANEL_COMPACT_MAX_WIDTH) {
    return 'compact';
  }
  if (width >= PANEL_WIDE_MIN_WIDTH) {
    return 'wide';
  }
  return 'regular';
}

function classifyPanelHeightMode(height: number): PanelHeightMode {
  return height <= PANEL_SHORT_MAX_HEIGHT ? 'short' : 'normal';
}

function readPanelModes(width: number, height: number): {
  readonly widthMode: PanelWidthMode;
  readonly heightMode: PanelHeightMode;
} {
  return {
    widthMode: classifyPanelWidthMode(width),
    heightMode: classifyPanelHeightMode(height),
  };
}

/**
 * Panel 响应式只允许一个 root 级 `ResizeObserver`。
 *
 * observer 只负责把像素尺寸折叠成离散语义模式，再写到 root `data-*`；
 * 不把每次 drag-resize 像素值塞进 React state，也不为子组件分发 observer。
 */
function usePanelResponsiveAttributes(panelRef: RefObject<HTMLDivElement | null>): void {
  const latestModesRef = useRef<string>('');

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }

    const applyModes = (width: number, height: number) => {
      const next = readPanelModes(width, height);
      const nextKey = `${next.widthMode}:${next.heightMode}`;
      if (latestModesRef.current === nextKey) {
        return;
      }
      latestModesRef.current = nextKey;
      panel.dataset.panelWidthMode = next.widthMode;
      panel.dataset.panelHeightMode = next.heightMode;
    };

    const rect = panel.getBoundingClientRect();
    applyModes(rect.width, rect.height);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        delete panel.dataset.panelWidthMode;
        delete panel.dataset.panelHeightMode;
        latestModesRef.current = '';
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) {
        return;
      }
      applyModes(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(panel);

    return () => {
      observer.disconnect();
      delete panel.dataset.panelWidthMode;
      delete panel.dataset.panelHeightMode;
      latestModesRef.current = '';
    };
  }, [panelRef]);
}

function useHostLayers(host: AppShellHost): {
  readonly layers: readonly LayerInfo[];
  readonly layersError: string | null;
  readonly layersLoading: boolean;
  readonly reloadLayers: () => Promise<void>;
} {
  const [layers, setLayers] = useState<readonly LayerInfo[]>([]);
  const [layersError, setLayersError] = useState<string | null>(null);
  const [layersLoading, setLayersLoading] = useState(false);

  async function reloadLayers(): Promise<void> {
    setLayersLoading(true);
    try {
      setLayers(await host.services.host.listLayers());
      setLayersError(null);
    } catch (error) {
      setLayers([]);
      setLayersError(error instanceof Error ? error.message : String(error));
    } finally {
      setLayersLoading(false);
    }
  }

  useEffect(() => {
    void reloadLayers();
  }, [host]);

  return { layers, layersError, layersLoading, reloadLayers };
}

function defaultModelFor(profile: ProviderProfile | undefined): string {
  return profile?.defaultModelId ?? '';
}

function mergeConfiguredDefaultModel(
  models: readonly UiModelInfo[],
): readonly UiModelInfo[] {
  return mainSelectableModels(models);
}

function AppShellContent({ host }: AppShellProps) {
  const { messages: t } = useI18n();
  const services = host.services;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const themeOverride = readThemeOverride();
  const [view, setView] = useState<View>('main');
  const [selectedImageProfileId, setSelectedImageProfileId] = useState<string | null>(null);
  const [activeImageProfileHydrated, setActiveImageProfileHydrated] = useState(false);
  const [selectedSettingsProfileId, setSelectedSettingsProfileId] = useState<string | null>(null);
  const [selectedPromptPresetId, setSelectedPromptPresetId] = useState<string | null>(null);
  const [modelConfigurationEditorSeed, setModelConfigurationEditorSeed] = useState<{
    readonly apiFormat?: ProviderProfile['apiFormat'] | null;
    readonly modelId?: string | null;
  } | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [highlightedRoundId, setHighlightedRoundId] = useState<string | null>(null);
  const [restoreFailedRoundId, setRestoreFailedRoundId] = useState<string | null>(null);
  const profilesState = useProviderProfiles(services);
  const imageProfiles = useMemo(
    () => profilesState.profiles.filter((profile): profile is ProviderProfile => Boolean(profile?.profileId)),
    [profilesState.profiles],
  );
  const selectedProfile = useMemo(
    () => imageProfiles.find((profile) => profile.profileId === selectedImageProfileId),
    [imageProfiles, selectedImageProfileId],
  );
  const selectedProfileModelsRevision = selectedProfile
    ? `${selectedProfile.updatedAt}:${defaultModelFor(selectedProfile)}`
    : '';
  const modelsState = useProfileModels(services, selectedImageProfileId, selectedProfileModelsRevision);
  const imageModels = useMemo(
    () => mergeConfiguredDefaultModel(modelsState.models),
    [modelsState.models],
  );
  const generationSettings = useGenerationSettings(services);
  const promptSettings = usePromptSettings(services);
  const imagenSession = useImagenSession(services);
  const conversation = useConversation(services, imagenSession, generationSettings.settings, t.conversation);
  const composerDraft = useComposerDraft();
  const modelGenerationSettings = useModelGenerationSettings(services, {
    profileId: selectedImageProfileId,
    apiFormat: selectedProfile?.apiFormat ?? null,
    modelId: selectedModelId,
    operation: composerDraft.operation,
  });
  const history = useJobHistory(services);
  const { records: historyRecords, loading: historyLoading, error: historyError, reload: reloadHistory } = history;
  const { layers, layersError, layersLoading, reloadLayers } = useHostLayers(host);
  const { show } = useToast();
  const previousRoundStatusRef = useRef<Record<string, 'running' | 'ok' | 'err'>>({});
  const reconciledHistoryRef = useRef(false);
  usePanelResponsiveAttributes(panelRef);

  const selectImageProfile = useCallback(async (profileId: string | null) => {
    setSelectedImageProfileId(profileId);
    await services.activeImageProfile.save(profileId);
  }, [services.activeImageProfile]);

  useEffect(() => {
    let cancelled = false;
    void services.activeImageProfile.load().then((profileId) => {
      if (cancelled) {
        return;
      }
      setSelectedImageProfileId(profileId);
      setActiveImageProfileHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [services.activeImageProfile]);

  useEffect(() => {
    if (reconciledHistoryRef.current) {
      return;
    }
    reconciledHistoryRef.current = true;
    const activeTaskIds = imagenSession.snapshot.jobs
      .filter((job) => job.status !== 'completed' && job.status !== 'failed')
      .map((job) => job.id);
    void services.commands.reconcileStaleRunningTaskRecords(activeTaskIds)
      .then((updated) => {
        if (updated.length > 0) {
          void reloadHistory();
        }
      });
  }, [imagenSession.snapshot.jobs, reloadHistory, services.commands]);

  useEffect(() => {
    if (!activeImageProfileHydrated) {
      return;
    }
    if (selectedImageProfileId && imageProfiles.some((profile) => profile.profileId === selectedImageProfileId)) {
      return;
    }
    const fallbackProfileId = imageProfiles[0]?.profileId ?? null;
    void selectImageProfile(fallbackProfileId);
  }, [activeImageProfileHydrated, imageProfiles, selectImageProfile, selectedImageProfileId]);

  useEffect(() => {
    const available = imageModels;
    const stillValid = available.some((model) => model.id === selectedModelId);
    if (stillValid) {
      return;
    }
    const configured = defaultModelFor(selectedProfile);
    const next = available.some((model) => model.id === configured)
      ? configured
      : available[0]?.id ?? '';
    setSelectedModelId(next);
  }, [imageModels, selectedProfile, selectedModelId]);

  const onNav = (next: string) => setView(next as View);

  const onEditProfile = useCallback(
    (profileId: string) => {
      setSelectedSettingsProfileId(profileId);
      setView('settings-detail');
    },
    [],
  );

  const onLocateRound = useCallback(
    (roundId: string) => {
      setHighlightedRoundId(roundId);
      setView('main');
    },
    [],
  );

  const onHistoryMiss = useCallback(() => {
    setHighlightedRoundId(null);
    setView('main');
  }, []);

  const onHistoryRetry = useCallback(async (roundId: string) => {
    const round = conversation.rounds.find((item) => item.id === roundId);
    if (round?.status === 'err') {
      setRestoreFailedRoundId(roundId);
      setHighlightedRoundId(roundId);
      setView('main');
      return;
    }
    await conversation.retry(roundId);
  }, [conversation]);

  const onPlaceTaskOutput = useCallback(async (record: TaskRecord, outputId: string) => {
    const taskResources = services.taskResources;
    if (!taskResources || !services.host.capabilities.canPlaceAssetOnCanvas) {
      throw new Error(t.history.resourceUnavailable);
    }
    await placeTaskOutputOnCanvas(record, outputId, {
      taskResources,
      host: services.host,
    });
  }, [services.host, services.taskResources, t.history.resourceUnavailable]);

  const onDownloadTaskOutput = useCallback(async (record: TaskRecord, outputId: string) => {
    if (!services.host.capabilities.canSaveAssetToFile) {
      throw new Error(t.history.resourceUnavailable);
    }
    await saveTaskOutputToFile(record, outputId, {
      host: services.host,
    });
  }, [services.host, t.history.resourceUnavailable]);

  useEffect(() => {
    if (!highlightedRoundId) {
      return;
    }
    const timer = window.setTimeout(() => setHighlightedRoundId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [highlightedRoundId]);

  useEffect(() => {
    let shouldReload = false;
    const next: Record<string, 'running' | 'ok' | 'err'> = {};
    for (const round of conversation.rounds) {
      next[round.id] = round.status;
      const previous = previousRoundStatusRef.current[round.id];
      if (previous === 'running' && round.status !== 'running') {
        shouldReload = true;
      }
    }
    previousRoundStatusRef.current = next;
    if (shouldReload) {
      void reloadHistory();
    }
  }, [conversation.rounds, reloadHistory]);

  return (
    <div className="panel" data-app-theme={themeOverride} ref={panelRef}>
      {view === 'main' && (
        <MotionPageFrame watch={view}>
          <MainPage
          onNav={onNav}
          profiles={imageProfiles}
          profilesLoading={profilesState.loading}
          profilesError={profilesState.error}
          selectedProfile={selectedProfile}
          selectedProfileId={selectedImageProfileId}
          onSelectProfile={(profileId) => {
            void selectImageProfile(profileId);
          }}
          models={imageModels}
          modelsLoading={modelsState.loading}
          modelsError={modelsState.error}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          layers={layers}
          layersError={layersError}
          layersLoading={layersLoading}
          reloadLayers={reloadLayers}
          conversation={conversation}
          highlightedRoundId={highlightedRoundId}
          onEditProfile={onEditProfile}
          composerDraft={composerDraft}
          generationSettings={generationSettings.settings}
          modelGenerationSettings={modelGenerationSettings}
          restoreFailedRoundId={restoreFailedRoundId}
          onFailedRoundRestored={(roundId) => {
            if (restoreFailedRoundId === roundId) {
              setRestoreFailedRoundId(null);
            }
          }}
          />
        </MotionPageFrame>
      )}
      {view === 'history' && (
        <MotionPageFrame watch={view}>
          <HistoryPage
          onNav={onNav}
          rounds={conversation.rounds}
          records={historyRecords}
          loading={historyLoading}
          error={historyError}
          onReload={reloadHistory}
          onRetry={onHistoryRetry}
          taskResources={services.taskResources}
          onDownloadTaskOutput={onDownloadTaskOutput}
          onPlaceTaskOutput={onPlaceTaskOutput}
          onLocateRound={onLocateRound}
          onMiss={onHistoryMiss}
          />
        </MotionPageFrame>
      )}
      {view === 'settings' && (
        <MotionPageFrame watch={view}>
          <SettingsPage
          onNav={onNav}
          profiles={imageProfiles}
          loading={profilesState.loading}
          error={profilesState.error}
          onReload={profilesState.reload}
          onOpenProfile={(profileId) => {
            setSelectedSettingsProfileId(profileId);
            setView('settings-detail');
          }}
          onOpenGlobalGeneration={() => setView('global-generation-settings')}
          onOpenPromptSettings={() => setView('prompt-settings')}
          onOpenModelConfiguration={() => {
            setModelConfigurationEditorSeed(null);
            setView('model-configuration');
          }}
          generationSettings={generationSettings.settings}
          modelGenerationSettings={modelGenerationSettings}
          />
        </MotionPageFrame>
      )}
      {view === 'settings-add' && (
        <MotionPageFrame watch={view}>
          <SettingsAddPage
          onNav={onNav}
          profiles={imageProfiles}
          onProfileSaved={async (profileId, options) => {
            await profilesState.reload();
            if (options.useProvider) {
              await selectImageProfile(profileId);
            }
            show(options.message, 'positive', { key: 'settings-add-provider-saved' });
            setSelectedSettingsProfileId(profileId);
            setView('settings');
          }}
          />
        </MotionPageFrame>
      )}
      {view === 'settings-detail' && (
        <MotionPageFrame watch={view}>
          <SettingsDetailPage
          onNav={onNav}
          profileId={selectedSettingsProfileId}
          onSaved={(message) => show(message, 'positive', { key: 'settings-provider-saved' })}
          onOpenModelConfiguration={(input) => {
            setModelConfigurationEditorSeed(input);
            setView('model-configuration');
          }}
          onProfilesChanged={async (profileId) => {
            await services.diagnostics?.checkpoint('uxp.ui.app_shell.profiles_changed.entered', {
              profileId,
              currentSelectedImageProfileId: selectedImageProfileId,
              currentSelectedSettingsProfileId: selectedSettingsProfileId,
            });
            try {
              await services.diagnostics?.checkpoint('uxp.ui.app_shell.profiles_changed.before_reload', { profileId });
              await profilesState.reload();
              await services.diagnostics?.checkpoint('uxp.ui.app_shell.profiles_changed.after_reload', { profileId });
              await services.diagnostics?.checkpoint('uxp.ui.app_shell.profiles_changed.before_select_profile', { profileId });
              setSelectedSettingsProfileId(profileId);
              if (profileId) {
                await selectImageProfile(profileId);
                const profileResult = await services.commands.getProviderProfile(profileId);
                if (profileResult.ok) {
                  setSelectedModelId(defaultModelFor(profileResult.value));
                }
              }
              await services.diagnostics?.checkpoint('uxp.ui.app_shell.profiles_changed.after_select_profile', { profileId });
            } catch (error) {
              await services.diagnostics?.failure('uxp.ui.app_shell.profiles_changed.failed', error, { profileId });
              throw error;
            }
          }}
          />
        </MotionPageFrame>
      )}
      {view === 'global-generation-settings' && (
        <MotionPageFrame watch={view}>
          <GlobalGenerationSettingsPage
          onNav={onNav}
          settings={generationSettings.settings}
          loading={generationSettings.loading}
          error={generationSettings.error}
          saveState={generationSettings.saveState}
          modelGenerationSettings={modelGenerationSettings}
          onSave={generationSettings.save}
          />
        </MotionPageFrame>
      )}
      {view === 'model-configuration' && (
        <MotionPageFrame watch={view}>
          <ModelConfigurationPage
          onNav={onNav}
          onSaved={async ({ apiFormat, modelId }) => {
            if (selectedSettingsProfileId) {
              const profileResult = await services.commands.getProviderProfile(selectedSettingsProfileId);
              if (profileResult.ok && profileResult.value.apiFormat === apiFormat) {
                setModelConfigurationEditorSeed({ apiFormat, modelId });
                setView('settings-detail');
                return;
              }
            }
            setModelConfigurationEditorSeed({ apiFormat, modelId });
          }}
          initialEditorState={modelConfigurationEditorSeed}
          />
        </MotionPageFrame>
      )}
      {view === 'prompt-settings' && (
        <MotionPageFrame watch={view}>
          <PromptSettingsPage
          onNav={onNav}
          settings={promptSettings.settings}
          profiles={promptSettings.profiles}
          loading={promptSettings.loading}
          error={promptSettings.error}
          saveState={promptSettings.saveState}
          templateValid={promptSettings.templateValid}
          activationState={promptSettings.activationState}
          presetViews={promptSettings.presetViews}
          onSave={promptSettings.save}
          onSelectPreset={promptSettings.selectPreset}
          onDeletePreset={promptSettings.deletePreset}
          onOpenPreset={(presetId) => {
            setSelectedPromptPresetId(presetId);
            setView('prompt-preset-detail');
          }}
          />
        </MotionPageFrame>
      )}
      {view === 'prompt-preset-detail' && (
        <MotionPageFrame watch={view}>
          <PromptPresetDetailPage
          onNav={onNav}
          preset={selectedPromptPresetId
            ? promptSettings.settings.presets.items.find((preset) => preset.id === selectedPromptPresetId) ?? null
            : null}
          onSave={promptSettings.upsertPreset}
          />
        </MotionPageFrame>
      )}
      <ToastHost />
      <PopupLayerRoot />
    </div>
  );
}

export function AppShell({ host }: AppShellProps) {
  ensurePanelCss();
  return (
    <I18nProvider locale={host.locale}>
      <AppServicesProvider services={host.services}>
        <ToastProvider>
          <PopupLayerProvider>
            <AppShellContent host={host} />
          </PopupLayerProvider>
        </ToastProvider>
      </AppServicesProvider>
    </I18nProvider>
  );
}

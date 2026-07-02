import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AppServicesProvider } from '../ports/app-services-context';
import type { AppServices } from '../ports/app-services';
import type { LayerInfo } from '../ports/host-port';
import { PROMPT_OPTIMIZER_PROFILE_ID, type ProviderProfile } from '@imagen-ps/application';
import type { SupportedLocale } from '../domain/locale';
import type { PluginAppModel } from '../domain/plugin-app-model';
import { useConversation } from './hooks/use-conversation';
import { useImagenSession } from './hooks/use-imagen-session';
import { useGenerationSettings } from './hooks/use-generation-settings';
import { useJobHistory } from './hooks/use-job-history';
import { useProfileModels, useProviderProfiles } from './hooks/use-provider-settings';
import { MainPage } from './pages/main-page';
import { HistoryPage } from './pages/history-page';
import { SettingsPage } from './pages/settings-page';
import { SettingsAddPage } from './pages/settings-add-page';
import { SettingsDetailPage } from './pages/settings-detail-page';
import { GlobalGenerationSettingsPage } from './pages/global-generation-settings-page';
import { ToastHost } from './components/toast-host';
import { useNotice } from './components/notice';
import { I18nProvider, useI18n } from './i18n/i18n-context';
import { ensurePanelCss } from './panel-bootstrap';
import { placeTaskOutputOnCanvas } from '../domain/task-actions';
import type { TaskRecord } from '@imagen-ps/application';
import { MotionPageFrame } from './components/motion-ui';

export interface AppShellHost {
  readonly app: PluginAppModel;
  readonly locale: SupportedLocale;
  readonly services: AppServices;
  dispose(): void;
}

export interface AppShellProps {
  readonly host: AppShellHost;
}

type View = 'main' | 'history' | 'settings' | 'settings-add' | 'settings-detail' | 'global-generation-settings';
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
  readonly reloadLayers: () => Promise<void>;
} {
  const [layers, setLayers] = useState<readonly LayerInfo[]>([]);
  const [layersError, setLayersError] = useState<string | null>(null);

  async function reloadLayers(): Promise<void> {
    try {
      setLayers(await host.services.host.listLayers());
      setLayersError(null);
    } catch (error) {
      setLayers([]);
      setLayersError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void reloadLayers();
  }, [host]);

  return { layers, layersError, reloadLayers };
}

function defaultModelFor(profile: ProviderProfile | undefined): string {
  const configured = profile?.config.defaultModel;
  return typeof configured === 'string' ? configured : '';
}

function AppShellContent({ host }: AppShellProps) {
  const { messages: t } = useI18n();
  const services = host.services;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const themeOverride = readThemeOverride();
  const [view, setView] = useState<View>('main');
  const [selectedImageProfileId, setSelectedImageProfileId] = useState<string | null>(null);
  const [selectedSettingsProfileId, setSelectedSettingsProfileId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [highlightedRoundId, setHighlightedRoundId] = useState<string | null>(null);
  const profilesState = useProviderProfiles(services);
  const imageProfiles = useMemo(
    () => profilesState.profiles.filter((profile) => profile.profileId !== PROMPT_OPTIMIZER_PROFILE_ID),
    [profilesState.profiles],
  );
  const promptOptimizerProfile = useMemo(
    () => profilesState.profiles.find((profile) => profile.profileId === PROMPT_OPTIMIZER_PROFILE_ID) ?? null,
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
  const generationSettings = useGenerationSettings(services);
  const imagenSession = useImagenSession(services);
  const conversation = useConversation(services, imagenSession, generationSettings.settings, t.conversation);
  const history = useJobHistory(services);
  const { records: historyRecords, loading: historyLoading, error: historyError, reload: reloadHistory } = history;
  const { layers, layersError, reloadLayers } = useHostLayers(host);
  const { notice: toast, show, clear, pause, resume } = useNotice({ defaultDurationMs: null });
  const previousRoundStatusRef = useRef<Record<string, 'running' | 'ok' | 'err'>>({});

  usePanelResponsiveAttributes(panelRef);

  useEffect(() => {
    if (selectedImageProfileId && imageProfiles.some((profile) => profile.profileId === selectedImageProfileId)) {
      return;
    }
    setSelectedImageProfileId(imageProfiles[0]?.profileId ?? null);
  }, [imageProfiles, selectedImageProfileId]);

  useEffect(() => {
    void services.commands.ensurePromptOptimizerProfile().then((result) => {
      if (result.ok) {
        void profilesState.reload();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  useEffect(() => {
    const available = modelsState.models;
    const stillValid = available.some((model) => model.id === selectedModelId);
    if (stillValid) {
      return;
    }
    const configured = defaultModelFor(selectedProfile);
    const next = configured || available[0]?.id || '';
    setSelectedModelId(next);
  }, [modelsState.models, selectedProfile, selectedModelId]);

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
          onSelectProfile={setSelectedImageProfileId}
          models={modelsState.models}
          modelsLoading={modelsState.loading}
          modelsError={modelsState.error}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          layers={layers}
          layersError={layersError}
          reloadLayers={reloadLayers}
          conversation={conversation}
          highlightedRoundId={highlightedRoundId}
          onEditProfile={onEditProfile}
          promptOptimizerProfile={promptOptimizerProfile}
          generationSettings={generationSettings.settings}
          onChangeOutputSizePreset={async (outputSizePreset) => {
            await generationSettings.save({
              ...generationSettings.settings,
              outputSizePreset,
            });
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
          onRetry={conversation.retry}
          taskResources={services.taskResources}
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
          promptOptimizerProfile={promptOptimizerProfile}
          onOpenPromptOptimizer={() => {
            setSelectedSettingsProfileId(PROMPT_OPTIMIZER_PROFILE_ID);
            setView('settings-detail');
          }}
          onOpenGlobalGeneration={() => setView('global-generation-settings')}
          />
        </MotionPageFrame>
      )}
      {view === 'settings-add' && (
        <MotionPageFrame watch={view}>
          <SettingsAddPage
          onNav={onNav}
          profiles={imageProfiles}
          onProfileSaved={async (profileId) => {
            await profilesState.reload();
            setSelectedImageProfileId(profileId);
            setSelectedSettingsProfileId(profileId);
            setView('settings-detail');
          }}
          />
        </MotionPageFrame>
      )}
      {view === 'settings-detail' && (
        <MotionPageFrame watch={view}>
          <SettingsDetailPage
          onNav={onNav}
          profileId={selectedSettingsProfileId}
          onSaved={(message) => show(message, 'positive', { durationMs: 1800, dismissible: false, copyable: false })}
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
              if (profileId && profileId !== PROMPT_OPTIMIZER_PROFILE_ID) {
                setSelectedImageProfileId(profileId);
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
          onSave={generationSettings.save}
          />
        </MotionPageFrame>
      )}
      <ToastHost toast={toast} onClose={clear} onPause={pause} onResume={resume} />
    </div>
  );
}

export function AppShell({ host }: AppShellProps) {
  ensurePanelCss();
  return (
    <I18nProvider locale={host.locale}>
      <AppServicesProvider services={host.services}>
        <AppShellContent host={host} />
      </AppServicesProvider>
    </I18nProvider>
  );
}

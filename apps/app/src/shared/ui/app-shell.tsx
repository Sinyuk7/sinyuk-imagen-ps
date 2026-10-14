import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AppServicesProvider } from '../ports/app-services-context';
import type { AppServices } from '../ports/app-services';
import type { LayerInfo } from '../ports/host-port';
import type { SupportedLocale } from '../domain/locale';
import type { PluginAppModel } from '../domain/plugin-app-model';
import { useConversation, type RoundStatus } from './hooks/use-conversation';
import { useComposerDraft } from './hooks/use-composer-draft';
import { useImagenSession } from './hooks/use-imagen-session';
import { useGenerationSettings } from './hooks/use-generation-settings';
import { usePromptSettings } from './hooks/use-prompt-settings';
import { useJobHistory } from './hooks/use-job-history';
import { useProviderAccounts } from './hooks/use-provider-settings';
import { MainPage } from './pages/main-page';
import { HistoryPage } from './pages/history-page';
import { SettingsPage } from './pages/settings-page';
import { GlobalGenerationSettingsPage } from './pages/global-generation-settings-page';
import { PromptSettingsPage } from './pages/prompt-settings-page';
import { PromptPresetDetailPage } from './pages/prompt-preset-detail-page';
import { ProviderAccountSettingsPage } from './pages/provider-account-settings-page';
import { ToastHost, ToastProvider } from './components/toast-host';
import { PopupLayerProvider, PopupLayerRoot } from './components/popup-layer';
import { I18nProvider, useI18n } from './i18n/i18n-context';
import { ensurePanelCss } from './panel-bootstrap';
import { registerSpectrumTheme } from './primitives/spectrum-registry';
import { placeTaskOutputOnCanvas, saveTaskOutputToFile } from '../domain/task-actions';
import type { TaskRecord } from '@imagen-ps/application';
import { MotionPageFrame } from './components/motion-ui';
import { fixedProviderModels, mainSelectableModels, type UiModelInfo } from './model-info';
import { useComfyUiManagement } from './hooks/use-comfyui-management';
import { useGenerationWorkspace } from './hooks/use-generation-workspace';
import { settingsBackRoute, type SettingsRoute, type SettingsTab } from './settings-route';

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
  | 'provider-account'
  | 'global-generation-settings'
  | 'prompt-settings'
  | 'prompt-preset-detail';
type AppTheme = 'dark' | 'light';
type AppThemeOverride = AppTheme | undefined;
type PanelWidthMode = 'compact' | 'regular' | 'wide';
type PanelHeightMode = 'short' | 'normal';
const PANEL_COMPACT_MAX_WIDTH = 339;
const PANEL_WIDE_MIN_WIDTH = 520;
const PANEL_SHORT_MAX_HEIGHT = 459;

function viewForSettingsRoute(route: SettingsRoute): View {
  switch (route.kind) {
    case 'root': return 'settings';
    case 'global-settings': return 'global-generation-settings';
    case 'provider-account': return 'provider-account';
    case 'prompt-settings': return 'prompt-settings';
    case 'prompt-preset-detail': return 'prompt-preset-detail';
  }
}

function rootTabForSettingsRoute(route: SettingsRoute): SettingsTab {
  if (route.kind === 'provider-account') return 'provider';
  if (route.kind === 'global-settings' || route.kind === 'prompt-settings' || route.kind === 'prompt-preset-detail') return 'general';
  return route.tab;
}

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

function useSpectrumTheme(): AppTheme {
  const override = readThemeOverride();
  const [systemTheme, setSystemTheme] = useState<AppTheme>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  );

  useEffect(() => {
    if (override || typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const sync = () => setSystemTheme(media.matches ? 'light' : 'dark');
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [override]);

  return override ?? systemTheme;
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
  const [selectedProviderId, setSelectedProviderId] = useState<'grsai' | 'runninghub'>('grsai');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [highlightedRoundId, setHighlightedRoundId] = useState<string | null>(null);
  const [restoreFailedRoundId, setRestoreFailedRoundId] = useState<string | null>(null);
  const providerAccountsState = useProviderAccounts(services);
  const imageModels = useMemo(
    () => mergeConfiguredDefaultModel(fixedProviderModels(selectedProviderId)),
    [selectedProviderId],
  );
  const generationSettings = useGenerationSettings(services);
  const promptSettings = usePromptSettings(services);
  const comfyUiManagement = useComfyUiManagement(services.comfyUi);
  const imagenSession = useImagenSession(services);
  const conversation = useConversation(services, imagenSession, generationSettings.settings, t.conversation);
  const composerDraft = useComposerDraft();
  const generationWorkspace = useGenerationWorkspace({
    host: services.host,
    conversation,
    composerDraft,
    comfyUi: comfyUiManagement,
    providerId: selectedProviderId,
    selectProvider: setSelectedProviderId,
    models: imageModels,
    modelsLoading: false,
    modelsError: null,
    selectedModelId,
    selectModel: setSelectedModelId,
    generationSettings,
    commands: services.commands,
  });
  const [settingsRoute, setSettingsRoute] = useState<SettingsRoute>({ kind: 'root', tab: 'provider' });
  const history = useJobHistory(services);
  const { records: historyRecords, loading: historyLoading, error: historyError, reload: reloadHistory } = history;
  const { layers, layersError, layersLoading, reloadLayers } = useHostLayers(host);
  const previousRoundStatusRef = useRef<Record<string, RoundStatus>>({});
  const reconciledHistoryRef = useRef(false);
  usePanelResponsiveAttributes(panelRef);


  useEffect(() => {
    if (reconciledHistoryRef.current) {
      return;
    }
    reconciledHistoryRef.current = true;
    const activeTaskIds = imagenSession.snapshot.jobs
      .filter((job) => job.status !== 'completed' && job.status !== 'failed')
      .map((job) => job.taskId ?? job.id);
    void services.commands.reconcileStaleRunningTaskRecords(activeTaskIds)
      .then((updated) => {
        if (updated.length > 0) {
          void reloadHistory();
        }
      });
  }, [imagenSession.snapshot.jobs, reloadHistory, services.commands]);

  useEffect(() => {
    const available = imageModels;
    const stillValid = available.some((model) => model.id === selectedModelId);
    if (stillValid) {
      return;
    }
    setSelectedModelId(available[0]?.id ?? '');
  }, [imageModels, selectedModelId, selectedProviderId]);

  const setAppView = useCallback((next: View) => {
    setView(next);
  }, []);

  const openSettingsRoute = useCallback((route: SettingsRoute) => {
    setSettingsRoute(route);
    setView(viewForSettingsRoute(route));
  }, []);

  const goBackInSettings = useCallback(() => {
    const previous = settingsBackRoute(settingsRoute);
    if (previous === 'main') {
      setAppView('main');
      return;
    }
    openSettingsRoute(previous);
  }, [openSettingsRoute, setAppView, settingsRoute]);

  const onNav = useCallback((next: string) => {
    if (next === 'prompt-settings') {
      openSettingsRoute({ kind: 'prompt-settings' });
      return;
    }
    if (next === 'settings') {
      const tab = settingsRoute.kind === 'root'
        ? generationWorkspace.settingsRoute === 'comfyui' ? 'comfyui' : 'provider'
        : rootTabForSettingsRoute(settingsRoute);
      openSettingsRoute({ kind: 'root', tab });
      return;
    }
    setAppView(next as View);
  }, [generationWorkspace.settingsRoute, openSettingsRoute, setAppView, settingsRoute]);

  const onLocateRound = useCallback(
    (roundId: string) => {
      setHighlightedRoundId(roundId);
      setAppView('main');
    },
    [setAppView],
  );

  const onHistoryMiss = useCallback(() => {
    setHighlightedRoundId(null);
    setAppView('main');
  }, [setAppView]);

  const onHistoryRetry = useCallback(async (roundId: string) => {
    const round = conversation.rounds.find((item) => item.id === roundId);
    if (round?.status === 'err') {
      setRestoreFailedRoundId(roundId);
      setHighlightedRoundId(roundId);
      setAppView('main');
      return;
    }
    await conversation.retry(roundId);
  }, [conversation, setAppView]);

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
    const next: Record<string, RoundStatus> = {};
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
          workspace={generationWorkspace}
          layers={layers}
          layersError={layersError}
          layersLoading={layersLoading}
          reloadLayers={reloadLayers}
          conversation={conversation}
          highlightedRoundId={highlightedRoundId}
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
          activeTab={settingsRoute.kind === 'root' ? settingsRoute.tab : 'provider'}
          onSelectTab={(tab) => {
            if (tab === 'provider' || tab === 'comfyui') generationWorkspace.setSettingsRoute(tab);
            openSettingsRoute({ kind: 'root', tab });
          }}
          onBack={goBackInSettings}
          accounts={providerAccountsState.accounts}
          loading={providerAccountsState.loading}
          error={providerAccountsState.error}
          onOpenProviderAccounts={(providerId) => openSettingsRoute({ kind: 'provider-account', providerId })}
          onOpenGlobalSettings={() => openSettingsRoute({ kind: 'global-settings' })}
          onOpenPromptSettings={() => openSettingsRoute({ kind: 'prompt-settings' })}
          generationSettings={generationSettings.settings}
          comfyUi={comfyUiManagement}
          />
        </MotionPageFrame>
      )}
      {view === 'provider-account' && settingsRoute.kind === 'provider-account' && (
        <ProviderAccountSettingsPage
          services={services}
          providerId={settingsRoute.providerId}
          accounts={providerAccountsState.accounts}
          onBack={goBackInSettings}
          onSaved={() => void providerAccountsState.reload()}
        />
      )}
      {view === 'global-generation-settings' && settingsRoute.kind === 'global-settings' && (
        <MotionPageFrame watch={view}>
          <GlobalGenerationSettingsPage
          settings={generationSettings.settings}
          loading={generationSettings.loading}
          error={generationSettings.error}
          saveState={generationSettings.saveState}
          onSave={generationSettings.save}
          onBack={goBackInSettings}
          />
        </MotionPageFrame>
      )}
      {view === 'prompt-settings' && settingsRoute.kind === 'prompt-settings' && (
        <MotionPageFrame watch={view}>
          <PromptSettingsPage
          onNav={onNav}
          settings={promptSettings.settings}
          providers={promptSettings.providers}
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
            openSettingsRoute({ kind: 'prompt-preset-detail', presetId });
          }}
          />
        </MotionPageFrame>
      )}
      {view === 'prompt-preset-detail' && settingsRoute.kind === 'prompt-preset-detail' && (
        <MotionPageFrame watch={view}>
          <PromptPresetDetailPage
          onNav={onNav}
          preset={settingsRoute.presetId
            ? promptSettings.settings.presets.items.find((preset) => preset.id === settingsRoute.presetId) ?? null
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
  registerSpectrumTheme();
  const theme = useSpectrumTheme();
  return (
    <I18nProvider locale={host.locale}>
      <AppServicesProvider services={host.services}>
        <sp-theme color={theme} scale="medium" class="app-spectrum-theme">
          <ToastProvider>
            <PopupLayerProvider>
              <AppShellContent host={host} />
            </PopupLayerProvider>
          </ToastProvider>
        </sp-theme>
      </AppServicesProvider>
    </I18nProvider>
  );
}

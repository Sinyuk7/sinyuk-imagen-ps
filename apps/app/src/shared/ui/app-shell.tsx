import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppServicesProvider } from '../ports/app-services-context';
import type { AppServices } from '../ports/app-services';
import type { LayerInfo } from '../ports/host-port';
import { PROMPT_OPTIMIZER_PROFILE_ID, type ProviderProfile } from '@imagen-ps/application';
import type { SupportedLocale } from '../domain/locale';
import type { PluginAppModel } from '../domain/plugin-app-model';
import { PANEL_CSS } from './panel-css';
import { useConversation } from './hooks/use-conversation';
import { useImagenSession } from './hooks/use-imagen-session';
import { useJobHistory } from './hooks/use-job-history';
import { useProfileModels, useProviderProfiles } from './hooks/use-provider-settings';
import { MainPage } from './pages/main-page';
import { HistoryPage } from './pages/history-page';
import { SettingsPage } from './pages/settings-page';
import { SettingsAddPage } from './pages/settings-add-page';
import { SettingsDetailPage } from './pages/settings-detail-page';
import { I18nProvider, useI18n } from './i18n/i18n-context';
import { registerSpectrumTheme } from './primitives/spectrum-theme';

export interface AppShellHost {
  readonly app: PluginAppModel;
  readonly locale: SupportedLocale;
  readonly services: AppServices;
  dispose(): void;
}

export interface AppShellProps {
  readonly host: AppShellHost;
}

type View = 'main' | 'history' | 'settings' | 'settings-add' | 'settings-detail';
type AppTheme = 'dark' | 'light';

/**
 * Photoshop 主题同步 query：UXP 自 4.1 起支持四值 `prefers-color-scheme`
 * （lightest/light/dark/darkest）。`light` 与 `lightest` 合并查询，
 * 其余（dark/darkest）回退到 dark。
 */
const LIGHT_THEME_QUERY = '(prefers-color-scheme: light), (prefers-color-scheme: lightest)';

function usePanelCss(): void {
  useEffect(() => {
    const styleId = 'imagen-ps-panel-styles';
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style');
      el.id = styleId;
      el.textContent = PANEL_CSS;
      document.head.appendChild(el);
    }
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, []);
}

/**
 * 同步 `<sp-theme color="light|dark">` 到宿主主题。
 *
 * 自定义 UI 已通过 `--uxp-host-*` + `@media (prefers-color-scheme)` 纯 CSS
 * 自动跟随 Photoshop 四主题，不需要 JavaScript state。此处 JS 唯一职责
 * 是同步 SWC `<sp-theme>` 的 `color` property（CSS custom property 无法
 * 直接驱动 SWC 内部 theme fragment 选择）。
 *
 * 同步优先级：
 *  1. `window.matchMedia(LIGHT_THEME_QUERY)` + `change` listener —— 若 UXP
 *     实机支持，作为主实时同步机制
 *  2. CSS theme probe (`.uxp-theme-probe`) + `ResizeObserver` —— 若
 *     `matchMedia` listener 不可靠，用 probe 尺寸变化桥接
 *  3. `focus` / `visibilitychange` —— 仅作为恢复性 fallback，修复可能
 *     错过的同步，不作为主实时方案
 *
 * Chrome harness 通过 `?theme=light|dark` 显式覆盖以测试双主题。
 * 不使用 polling、`requestAnimationFrame` 或硬编码 Photoshop 四色值。
 */
function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>(() => readInitialTheme());

  useEffect(() => {
    const params = readThemeParam();
    if (params === 'light' || params === 'dark') {
      setTheme(params);
      return;
    }

    let current: AppTheme = readThemeViaMatchMedia() ?? readThemeViaProbe() ?? 'dark';
    setTheme(current);

    let cleanupMatchMedia: (() => void) | undefined;
    let cleanupProbe: (() => void) | undefined;

    const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(LIGHT_THEME_QUERY)
      : null;
    if (media) {
      const handler = () => {
        const next = media.matches ? 'light' : 'dark';
        if (next !== current) {
          current = next;
          setTheme(next);
        }
      };
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', handler);
        cleanupMatchMedia = () => media.removeEventListener('change', handler);
      } else if (typeof (media as MediaQueryList).addListener === 'function') {
        (media as MediaQueryList).addListener(handler);
        cleanupMatchMedia = () => (media as MediaQueryList).removeListener(handler);
      }
    }

    if (!cleanupMatchMedia && typeof ResizeObserver !== 'undefined') {
      const probe = createThemeProbe();
      if (probe) {
        const observer = new ResizeObserver(() => {
          const next = probe.offsetWidth === 2 ? 'light' : 'dark';
          if (next !== current) {
            current = next;
            setTheme(next);
          }
        });
        observer.observe(probe);
        cleanupProbe = () => {
          observer.disconnect();
          probe.remove();
        };
      }
    }

    const recoverySync = () => {
      const params = readThemeParam();
      if (params === 'light' || params === 'dark') {
        setTheme(params);
        return;
      }
      const next: AppTheme = readThemeViaMatchMedia() ?? readThemeViaProbe() ?? 'dark';
      if (next !== current) {
        current = next;
        setTheme(next);
      }
    };
    window.addEventListener('focus', recoverySync);
    document.addEventListener('visibilitychange', recoverySync);

    return () => {
      cleanupMatchMedia?.();
      cleanupProbe?.();
      window.removeEventListener('focus', recoverySync);
      document.removeEventListener('visibilitychange', recoverySync);
    };
  }, []);

  return theme;
}

function readThemeParam(): string | null {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('theme');
}

function readInitialTheme(): AppTheme {
  const params = readThemeParam();
  if (params === 'light' || params === 'dark') {
    return params;
  }
  return readThemeViaMatchMedia() ?? readThemeViaProbe() ?? 'dark';
}
function readThemeViaMatchMedia(): AppTheme | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(LIGHT_THEME_QUERY).matches ? 'light' : 'dark';
}

function readThemeViaProbe(): AppTheme | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const probe = createThemeProbe();
  if (!probe) {
    return null;
  }
  const isLight = probe.offsetWidth === 2;
  probe.remove();
  return isLight ? 'light' : 'dark';
}

function createThemeProbe(): HTMLDivElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const probe = document.createElement('div');
  probe.className = 'uxp-theme-probe';
  probe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(probe);
  return probe;
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
  const modelsState = useProfileModels(services, selectedImageProfileId);
  const imagenSession = useImagenSession(services);
  const conversation = useConversation(services, imagenSession, t.conversation);
  const history = useJobHistory(services);
  const { layers, layersError, reloadLayers } = useHostLayers(host);

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

  useEffect(() => {
    if (!highlightedRoundId) {
      return;
    }
    const timer = window.setTimeout(() => setHighlightedRoundId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [highlightedRoundId]);

  return (
    <div className="panel">
      {view === 'main' && (
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
        />
      )}
      {view === 'history' && (
        <HistoryPage
          onNav={onNav}
          rounds={conversation.rounds}
          records={history.records}
          loading={history.loading}
          error={history.error}
          onReload={history.reload}
          onRetry={conversation.retry}
          onLocateRound={onLocateRound}
          onMiss={onHistoryMiss}
        />
      )}
      {view === 'settings' && (
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
        />
      )}
      {view === 'settings-add' && (
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
      )}
      {view === 'settings-detail' && (
        <SettingsDetailPage
          onNav={onNav}
          profileId={selectedSettingsProfileId}
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
              }
              await services.diagnostics?.checkpoint('uxp.ui.app_shell.profiles_changed.after_select_profile', { profileId });
            } catch (error) {
              await services.diagnostics?.failure('uxp.ui.app_shell.profiles_changed.failed', error, { profileId });
              throw error;
            }
          }}
        />
      )}
    </div>
  );
}

export function AppShell({ host }: AppShellProps) {
  usePanelCss();
  registerSpectrumTheme();
  const theme = useAppTheme();
  return (
    <I18nProvider locale={host.locale}>
      <AppServicesProvider services={host.services}>
        <sp-theme color={theme} scale="medium" class="app-theme">
          <AppShellContent host={host} />
        </sp-theme>
      </AppServicesProvider>
    </I18nProvider>
  );
}

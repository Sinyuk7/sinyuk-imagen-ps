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
  return (
    <I18nProvider locale={host.locale}>
      <AppServicesProvider services={host.services}>
        <sp-theme color="dark" scale="medium" class="app-theme">
          <AppShellContent host={host} />
        </sp-theme>
      </AppServicesProvider>
    </I18nProvider>
  );
}

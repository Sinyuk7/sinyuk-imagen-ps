import { useEffect, useMemo, useState } from 'react';
import { AppServicesProvider } from '../app-services/app-services-context';
import type { LayerInfo } from '../app-services/host-bridge';
import type { ProviderProfile } from '@imagen-ps/application';
import type { PluginHostShell } from '../host/create-plugin-host-shell';
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

export interface AppShellProps {
  readonly host: PluginHostShell;
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

function useHostLayers(host: PluginHostShell): {
  readonly layers: readonly LayerInfo[];
  readonly reloadLayers: () => Promise<void>;
} {
  const [layers, setLayers] = useState<readonly LayerInfo[]>([]);

  async function reloadLayers(): Promise<void> {
    setLayers(await host.services.host.listLayers());
  }

  useEffect(() => {
    void reloadLayers();
  }, [host]);

  return { layers, reloadLayers };
}

function defaultModelFor(profile: ProviderProfile | undefined): string {
  const configured = profile?.config.defaultModel;
  return typeof configured === 'string' ? configured : '';
}

function AppShellContent({ host }: AppShellProps) {
  const services = host.services;
  const [view, setView] = useState<View>('main');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const profilesState = useProviderProfiles(services);
  const selectedProfile = useMemo(
    () => profilesState.profiles.find((profile) => profile.profileId === selectedProfileId),
    [profilesState.profiles, selectedProfileId],
  );
  const modelsState = useProfileModels(services, selectedProfileId);
  const imagenSession = useImagenSession(services);
  const conversation = useConversation(services, imagenSession);
  const history = useJobHistory(services);
  const { layers, reloadLayers } = useHostLayers(host);

  useEffect(() => {
    if (selectedProfileId && profilesState.profiles.some((profile) => profile.profileId === selectedProfileId)) {
      return;
    }
    setSelectedProfileId(profilesState.profiles[0]?.profileId ?? null);
  }, [profilesState.profiles, selectedProfileId]);

  useEffect(() => {
    const configured = defaultModelFor(selectedProfile);
    const firstDiscovered = modelsState.models[0]?.id ?? '';
    setSelectedModelId(configured || firstDiscovered);
  }, [modelsState.models, selectedProfile]);

  const onNav = (next: string) => setView(next as View);

  return (
    <div className="panel">
      {view === 'main' && (
        <MainPage
          onNav={onNav}
          profiles={profilesState.profiles}
          profilesLoading={profilesState.loading}
          profilesError={profilesState.error}
          selectedProfile={selectedProfile}
          selectedProfileId={selectedProfileId}
          onSelectProfile={setSelectedProfileId}
          models={modelsState.models}
          modelsLoading={modelsState.loading}
          modelsError={modelsState.error}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          layers={layers}
          reloadLayers={reloadLayers}
          conversation={conversation}
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
        />
      )}
      {view === 'settings' && (
        <SettingsPage
          onNav={onNav}
          profiles={profilesState.profiles}
          loading={profilesState.loading}
          error={profilesState.error}
          onReload={profilesState.reload}
          onOpenProfile={(profileId) => {
            setSelectedProfileId(profileId);
            setView('settings-detail');
          }}
        />
      )}
      {view === 'settings-add' && (
        <SettingsAddPage
          onNav={onNav}
          profiles={profilesState.profiles}
          onProfileSaved={async (profileId) => {
            await profilesState.reload();
            setSelectedProfileId(profileId);
            setView('settings-detail');
          }}
        />
      )}
      {view === 'settings-detail' && (
        <SettingsDetailPage
          onNav={onNav}
          profileId={selectedProfileId}
          onProfilesChanged={async (profileId) => {
            await profilesState.reload();
            setSelectedProfileId(profileId);
          }}
        />
      )}
    </div>
  );
}

export function AppShell({ host }: AppShellProps) {
  usePanelCss();
  return (
    <AppServicesProvider services={host.services}>
      <AppShellContent host={host} />
    </AppServicesProvider>
  );
}

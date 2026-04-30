import { useState, useEffect } from 'react';
import { PANEL_CSS } from './panel-css';
import { MainPage } from './pages/main-page';
import { HistoryPage } from './pages/history-page';
import { SettingsPage } from './pages/settings-page';
import { SettingsAddPage } from './pages/settings-add-page';
import { SettingsDetailPage } from './pages/settings-detail-page';
import type { PluginHostShell } from '../host/create-plugin-host-shell';

export interface AppShellProps {
  readonly host: PluginHostShell;
}

type View = 'main' | 'history' | 'settings' | 'settings-add' | 'settings-detail';

export function AppShell(_props: AppShellProps) {
  const [view, setView] = useState<View>('main');
  const [model, setModel] = useState('Nano Banana 2');

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

  const onNav = (next: string) => setView(next as View);

  return (
    <div className="panel">
      {view === 'main'             && <MainPage onNav={onNav} model={model} setModel={setModel} />}
      {view === 'history'          && <HistoryPage onNav={onNav} />}
      {view === 'settings'         && <SettingsPage onNav={onNav} />}
      {view === 'settings-add'     && <SettingsAddPage onNav={onNav} />}
      {view === 'settings-detail'  && <SettingsDetailPage onNav={onNav} />}
    </div>
  );
}

/**
 * @imagen-ps/app
 *
 * Photoshop / UXP panel entry.
 */
import {
  createImagenPanelRuntime,
  disposePreviousPanelRuntime,
  installUxpPanelEntrypoints,
} from './host/uxp-panel-runtime';
import { resolveUxpModules } from './host/uxp-api';

export { createPluginHostShell } from './host/create-plugin-host-shell';
export { createPluginAppModel } from './shared/plugin-app-model';
export { AppShell } from './ui/app-shell';
export { createImagenPanelRuntime, installUxpPanelEntrypoints } from './host/uxp-panel-runtime';

const modules = resolveUxpModules();

// UXPDT reload 可能复用同一个 JS context；先销毁旧 panel runtime，再安装本次入口。
disposePreviousPanelRuntime();

const panelRuntime = createImagenPanelRuntime();
globalThis.__IMAGEN_PS_PANEL_RUNTIME__ = panelRuntime;

const installedEntrypoints = installUxpPanelEntrypoints(panelRuntime, modules);
if (!installedEntrypoints && typeof document !== 'undefined') {
  panelRuntime.mount(document.getElementById('root'));
}

export const pluginHost = panelRuntime.host;
export default pluginHost;

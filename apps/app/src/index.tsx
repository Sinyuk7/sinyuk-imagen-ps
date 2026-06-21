/**
 * @imagen-ps/app
 *
 * Photoshop / UXP panel entry.
 */
import { createRoot, type Root } from 'react-dom/client';
import { createPluginHostShell } from './host/create-plugin-host-shell';
import type { PluginHostShell } from './host/create-plugin-host-shell';
import { readRecentLogRecords } from './host/uxp-diagnostics';
import { resolveUxpModules } from './host/uxp-api';
import { AppShell } from './ui/app-shell';

export { createPluginHostShell } from './host/create-plugin-host-shell';
export { createPluginAppModel } from './shared/plugin-app-model';
export { AppShell } from './ui/app-shell';

function errorMessageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function renderStartupError(rootEl: HTMLElement, error: unknown): void {
  rootEl.innerHTML = '';
  const container = document.createElement('div');
  container.setAttribute('role', 'alert');
  container.style.cssText = [
    'box-sizing:border-box',
    'min-height:100vh',
    'padding:16px',
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'font-size:12px',
    'line-height:18px',
    'color:#e9edf4',
    'background:#0d1117',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Imagen PS startup failed';
  title.style.cssText = 'font-weight:600;margin-bottom:8px;color:#f26d6d';

  const message = document.createElement('pre');
  message.textContent = errorMessageFrom(error);
  message.style.cssText = 'white-space:pre-wrap;margin:0;color:#a6b0bf';

  container.append(title, message);
  rootEl.appendChild(container);
}

function createSafePluginHost(rootEl: HTMLElement | null): PluginHostShell | undefined {
  try {
    return createPluginHostShell();
  } catch (error) {
    console.error('Imagen PS startup failed', error);
    if (rootEl) {
      renderStartupError(rootEl, error);
    }
    return undefined;
  }
}

export const pluginHost = createSafePluginHost(typeof document !== 'undefined' ? document.getElementById('root') : null);

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_HOST_SMOKE__: unknown;
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_REACT_ROOT__: Root | undefined;
}

function exposeHostSmokeHandle(host: PluginHostShell | undefined): void {
  if (!host || typeof window === 'undefined') {
    return;
  }
  if (window.localStorage?.getItem('imagenPsHostSmoke') !== '1') {
    delete globalThis.__IMAGEN_PS_HOST_SMOKE__;
    return;
  }

  // 仅用于真实 UXP smoke。返回值必须保持脱敏，避免 DevTools 输出 secret。
  globalThis.__IMAGEN_PS_HOST_SMOKE__ = {
    listProfiles: host.services.commands.listProviderProfiles,
    getProfile: host.services.commands.getProviderProfile,
    saveProfile: host.services.commands.saveProviderProfile,
    deleteProfile: host.services.commands.deleteProviderProfile,
    testProfile: host.services.commands.testProviderProfile,
    listModels: host.services.commands.listProfileModels,
    refreshModels: host.services.commands.refreshProfileModels,
    submitJob: host.services.commands.submitJob,
    listHistory: host.services.commands.listJobHistoryRecords,
    listLayers: host.services.host.listLayers,
    readLayerAsAsset: host.services.host.readLayerAsAsset,
    readLayerMaskAsAsset: host.services.host.readLayerMaskAsAsset,
    placeAssetOnCanvas: host.services.host.placeAssetOnCanvas,
    pickImageFile: host.services.host.pickImageFile,
    readRecentLogRecords: readRecentLogRecords.bind(undefined, resolveUxpModules()),
  };
}

exposeHostSmokeHandle(pluginHost);

function unmountPreviousRoot(): void {
  const previousRoot = globalThis.__IMAGEN_PS_REACT_ROOT__;
  if (!previousRoot) {
    return;
  }
  try {
    previousRoot.unmount();
  } catch (error) {
    console.warn('Imagen PS previous root unmount failed', error);
  } finally {
    globalThis.__IMAGEN_PS_REACT_ROOT__ = undefined;
  }
}

function renderApp(rootEl: HTMLElement, host: PluginHostShell): void {
  unmountPreviousRoot();
  const root = createRoot(rootEl);
  globalThis.__IMAGEN_PS_REACT_ROOT__ = root;
  root.render(<AppShell host={host} />);
}

const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (typeof document !== 'undefined' && rootEl && pluginHost) {
  try {
    renderApp(rootEl, pluginHost);
  } catch (error) {
    console.error('Imagen PS render failed', error);
    renderStartupError(rootEl, error);
  }
}

export default pluginHost;

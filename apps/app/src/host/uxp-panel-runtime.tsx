import { createRoot, type Root } from 'react-dom/client';
import { AppShell } from '../shared/ui/app-shell';
import type { PluginHostShell } from './create-plugin-host-shell';
import { createPluginHostShell } from './create-plugin-host-shell';
import { readRecentLogRecords } from './uxp-diagnostics';
import { resolveUxpModules, type UxpModules } from './uxp-api';

interface UxpPanelController {
  create?(): HTMLElement | undefined;
  show?(): void;
  hide?(): void;
  destroy?(): void;
}

interface UxpEntrypoints {
  setup(config: {
    readonly plugin?: {
      readonly create?: () => void;
      readonly destroy?: () => void;
    };
    readonly panels?: Record<string, UxpPanelController>;
  }): void;
}

interface UxpEntrypointsModule {
  readonly entrypoints?: UxpEntrypoints;
}

export interface ImagenPanelRuntime {
  readonly host: PluginHostShell | undefined;
  mount(rootEl: HTMLElement | null): PluginHostShell | undefined;
  dispose(): void;
}

export interface ImagenPanelRuntimeOptions {
  readonly createHost?: () => PluginHostShell;
  readonly resolveModules?: () => UxpModules;
  readonly renderStartupError?: (rootEl: HTMLElement, error: unknown) => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_HOST_SMOKE__: unknown;
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_REACT_ROOT__: Root | undefined;
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_PANEL_RUNTIME__: ImagenPanelRuntime | undefined;
}

function errorMessageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function renderStartupError(rootEl: HTMLElement, error: unknown): void {
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
  message.style.cssText = [
    'white-space:pre-wrap',
    'margin-top:0',
    'margin-right:0',
    'margin-bottom:0',
    'margin-left:0',
    'color:#a6b0bf',
  ].join(';');

  container.append(title, message);
  rootEl.appendChild(container);
}

function clearHostSmokeHandle(): void {
  if (typeof window === 'undefined') {
    return;
  }
  delete globalThis.__IMAGEN_PS_HOST_SMOKE__;
}

function isHostSmokeEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('imagenPsHostSmoke') === '1';
  } catch {
    return false;
  }
}

function exposeHostSmokeHandle(host: PluginHostShell | undefined, resolveModules: () => UxpModules): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (!host || !isHostSmokeEnabled()) {
    clearHostSmokeHandle();
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
    readRecentLogRecords: readRecentLogRecords.bind(undefined, resolveModules()),
  };
}

function unmountReactRoot(): void {
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

export function disposePreviousPanelRuntime(): void {
  const previousRuntime = globalThis.__IMAGEN_PS_PANEL_RUNTIME__;
  if (previousRuntime) {
    previousRuntime.dispose();
    globalThis.__IMAGEN_PS_PANEL_RUNTIME__ = undefined;
    return;
  }

  unmountReactRoot();
  clearHostSmokeHandle();
}

export function createImagenPanelRuntime(options?: ImagenPanelRuntimeOptions): ImagenPanelRuntime {
  const createHost = options?.createHost ?? createPluginHostShell;
  const resolveModules = options?.resolveModules ?? resolveUxpModules;
  const renderError = options?.renderStartupError ?? renderStartupError;
  let reactRoot: Root | undefined;
  let host: PluginHostShell | undefined;
  let mountedRootEl: HTMLElement | undefined;

  const runtime: ImagenPanelRuntime = {
    get host() {
      return host;
    },

    mount(rootEl: HTMLElement | null): PluginHostShell | undefined {
      if (!rootEl) {
        return undefined;
      }
      if (host && reactRoot && mountedRootEl === rootEl) {
        exposeHostSmokeHandle(host, resolveModules);
        return host;
      }

      runtime.dispose();
      mountedRootEl = rootEl;
      clearHostSmokeHandle();

      try {
        host = createHost();
        reactRoot = createRoot(rootEl);
        globalThis.__IMAGEN_PS_REACT_ROOT__ = reactRoot;
        reactRoot.render(<AppShell host={host} />);
        exposeHostSmokeHandle(host, resolveModules);
        return host;
      } catch (error) {
        console.error('Imagen PS startup failed', error);
        host = undefined;
        reactRoot = undefined;
        globalThis.__IMAGEN_PS_REACT_ROOT__ = undefined;
        clearHostSmokeHandle();
        renderError(rootEl, error);
        return undefined;
      }
    },

    dispose(): void {
      clearHostSmokeHandle();
      unmountReactRoot();
      reactRoot = undefined;
      mountedRootEl = undefined;
      try {
        host?.dispose?.();
      } catch (error) {
        console.warn('Imagen PS host shell dispose failed', error);
      } finally {
        host = undefined;
      }
    },
  };

  return runtime;
}

function entrypointsFrom(modules: UxpModules): UxpEntrypoints | undefined {
  return (modules.uxp as UxpEntrypointsModule | undefined)?.entrypoints;
}

function rootElementById(rootId: string): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return document.getElementById(rootId);
}

export function installUxpPanelEntrypoints(
  runtime: ImagenPanelRuntime,
  modules: UxpModules,
  options?: { readonly panelId?: string; readonly rootId?: string },
): boolean {
  const entrypoints = entrypointsFrom(modules);
  if (!entrypoints) {
    return false;
  }

  const panelId = options?.panelId ?? 'imagen-ps-panel';
  const rootId = options?.rootId ?? 'root';

  try {
    entrypoints.setup({
      plugin: {
        create() {
          // Photoshop UXP host 要求 plugin lifecycle 声明 create，即使 panel 挂载仍由 panel controller 负责。
        },
        destroy() {
          runtime.dispose();
        },
      },
      panels: {
        [panelId]: {
          create() {
            const rootEl = rootElementById(rootId);
            runtime.mount(rootEl);
            return rootEl ?? undefined;
          },
          show() {
            runtime.mount(rootElementById(rootId));
          },
          hide() {
            clearHostSmokeHandle();
          },
          destroy() {
            runtime.dispose();
          },
        },
      },
    });
    return true;
  } catch (error) {
    console.warn('Imagen PS UXP entrypoints setup failed', error);
    return false;
  }
}

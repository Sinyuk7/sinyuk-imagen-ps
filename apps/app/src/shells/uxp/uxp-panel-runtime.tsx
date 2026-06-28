import { createRoot, type Root } from 'react-dom/client';
import { AppShell } from '../../shared/ui/app-shell';
import type { PluginHostShell } from './create-plugin-host-shell';
import { createPluginHostShell } from './create-plugin-host-shell';
import { readRecentLogRecords } from '../../adapters/uxp/uxp-diagnostics';
import { resolveUxpModules, type UxpModules } from '../../adapters/uxp/uxp-api';

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
  setRecoveryCleanup(cleanup: (() => void) | undefined): void;
  dispose(): void;
}

export interface ImagenPanelRuntimeOptions {
  readonly createHost?: () => PluginHostShell;
  readonly resolveModules?: () => UxpModules;
  readonly renderStartupError?: (rootEl: HTMLElement, error: unknown) => void;
}

interface BootstrapLogger {
  checkpoint(event: string, attrs?: Record<string, unknown>): void | Promise<void>;
  failure(event: string, error: unknown, attrs?: Record<string, unknown>): void | Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_HOST_SMOKE__: unknown;
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_REACT_ROOT__: Root | undefined;
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_PANEL_RUNTIME__: ImagenPanelRuntime | undefined;
}

function bootstrapLogger(): BootstrapLogger | undefined {
  return (globalThis as { __IMAGEN_PS_BOOTSTRAP_LOG__?: BootstrapLogger }).__IMAGEN_PS_BOOTSTRAP_LOG__;
}

function bootstrapCheckpoint(event: string, attrs?: Record<string, unknown>): void {
  try {
    const logger = bootstrapLogger();
    if (!logger) {
      return;
    }
    if (attrs === undefined) {
      void logger.checkpoint(event);
      return;
    }
    void logger.checkpoint(event, attrs);
  } catch {
    // bootstrap 诊断不能影响真实面板启动。
  }
}

function bootstrapFailure(event: string, error: unknown, attrs?: Record<string, unknown>): void {
  try {
    const logger = bootstrapLogger();
    if (!logger) {
      return;
    }
    if (attrs === undefined) {
      void logger.failure(event, error);
      return;
    }
    void logger.failure(event, error, attrs);
  } catch {
    // bootstrap 诊断不能影响真实面板启动。
  }
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
  let recoveryCleanup: (() => void) | undefined;

  const teardownMountedState = (): void => {
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
  };

  const runtime: ImagenPanelRuntime = {
    get host() {
      return host;
    },

    mount(rootEl: HTMLElement | null): PluginHostShell | undefined {
      bootstrapCheckpoint('panel.bootstrap.runtime.mount.start', {
        hasRoot: Boolean(rootEl),
        hasHost: Boolean(host),
        hasReactRoot: Boolean(reactRoot),
      });
      if (!rootEl) {
        bootstrapCheckpoint('panel.bootstrap.runtime.mount.skipped', { reason: 'missing_root' });
        return undefined;
      }
      if (host && reactRoot && mountedRootEl === rootEl) {
        exposeHostSmokeHandle(host, resolveModules);
        bootstrapCheckpoint('panel.bootstrap.runtime.mount.reused', { hasHost: true });
        return host;
      }

      teardownMountedState();
      mountedRootEl = rootEl;
      clearHostSmokeHandle();

      try {
        reactRoot = createRoot(rootEl);
        globalThis.__IMAGEN_PS_REACT_ROOT__ = reactRoot;
        host = createHost();
        bootstrapCheckpoint('panel.bootstrap.host_shell.created');
        reactRoot.render(<AppShell host={host} />);
        bootstrapCheckpoint('panel.bootstrap.react.rendered');
        exposeHostSmokeHandle(host, resolveModules);
        bootstrapCheckpoint('panel.bootstrap.runtime.mount.complete', { hasHost: true });
        return host;
      } catch (error) {
        console.error('Imagen PS startup failed', error);
        bootstrapFailure('panel.bootstrap.runtime.mount.failed', error);
        host = undefined;
        reactRoot = undefined;
        globalThis.__IMAGEN_PS_REACT_ROOT__ = undefined;
        clearHostSmokeHandle();
        renderError(rootEl, error);
        return undefined;
      }
    },

    setRecoveryCleanup(cleanup: (() => void) | undefined): void {
      recoveryCleanup?.();
      recoveryCleanup = cleanup;
    },

    dispose(): void {
      recoveryCleanup?.();
      recoveryCleanup = undefined;
      teardownMountedState();
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

function installPanelRecoveryListeners(options: {
  readonly runtime: ImagenPanelRuntime;
  readonly rootId: string;
}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  const resume = (reason: 'focus' | 'visibilitychange'): void => {
    bootstrapCheckpoint('panel.bootstrap.panel.resume', { reason });
    options.runtime.mount(rootElementById(options.rootId));
  };

  const handleFocus = (): void => {
    resume('focus');
  };
  const handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    resume('visibilitychange');
  };

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
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
    runtime.setRecoveryCleanup(installPanelRecoveryListeners({ runtime, rootId }));
    bootstrapCheckpoint('panel.bootstrap.entrypoints.setup.start', { panelId });
    entrypoints.setup({
      plugin: {
        create() {
          // Photoshop UXP host 要求 plugin lifecycle 声明 create，即使 panel 挂载仍由 panel controller 负责。
          bootstrapCheckpoint('panel.bootstrap.plugin.create');
        },
        destroy() {
          bootstrapCheckpoint('panel.bootstrap.plugin.destroy');
          runtime.dispose();
        },
      },
      panels: {
        [panelId]: {
          create() {
            bootstrapCheckpoint('panel.bootstrap.panel.create');
            const rootEl = rootElementById(rootId);
            runtime.mount(rootEl);
            bootstrapCheckpoint('panel.bootstrap.panel.create.complete', { hasRoot: Boolean(rootEl) });
            return rootEl ?? undefined;
          },
          show() {
            bootstrapCheckpoint('panel.bootstrap.panel.show');
            runtime.mount(rootElementById(rootId));
          },
          hide() {
            bootstrapCheckpoint('panel.bootstrap.panel.hide');
            clearHostSmokeHandle();
          },
          destroy() {
            bootstrapCheckpoint('panel.bootstrap.panel.destroy');
            runtime.dispose();
          },
        },
      },
    });
    bootstrapCheckpoint('panel.bootstrap.entrypoints.setup.ok', { panelId });
    return true;
  } catch (error) {
    runtime.setRecoveryCleanup(undefined);
    console.warn('Imagen PS UXP entrypoints setup failed', error);
    bootstrapFailure('panel.bootstrap.entrypoints.setup.failed', error, { panelId });
    return false;
  }
}

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
import { createUxpFlightRecorder } from './host/uxp-log-sink';

export { createPluginHostShell } from './host/create-plugin-host-shell';
export { createPluginAppModel } from './shared/plugin-app-model';
export { AppShell } from './shared/ui/app-shell';
export { createImagenPanelRuntime, installUxpPanelEntrypoints } from './host/uxp-panel-runtime';

interface BootstrapLogger {
  readonly traceId?: string;
  checkpoint(event: string, attrs?: Record<string, unknown>): void | Promise<void>;
  failure(event: string, error: unknown, attrs?: Record<string, unknown>): void | Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_PS_BOOTSTRAP_LOG__: BootstrapLogger | undefined;
}

function bootstrapCheckpoint(event: string, attrs?: Record<string, unknown>): void {
  try {
    if (attrs === undefined) {
      void globalThis.__IMAGEN_PS_BOOTSTRAP_LOG__?.checkpoint(event);
      return;
    }
    void globalThis.__IMAGEN_PS_BOOTSTRAP_LOG__?.checkpoint(event, attrs);
  } catch {
    // bootstrap 诊断不能影响真实面板启动。
  }
}

function installBundleBootstrapLogger(modules: ReturnType<typeof resolveUxpModules>): void {
  if (globalThis.__IMAGEN_PS_BOOTSTRAP_LOG__) {
    return;
  }

  const flightRecorder = createUxpFlightRecorder(modules);
  globalThis.__IMAGEN_PS_BOOTSTRAP_LOG__ = {
    checkpoint(event: string, attrs?: Record<string, unknown>) {
      return flightRecorder.checkpoint(event, attrs);
    },
    failure(event: string, error: unknown, attrs?: Record<string, unknown>) {
      return flightRecorder.fail(event, error, attrs);
    },
  };
}

function bootstrapFailure(event: string, error: unknown, attrs?: Record<string, unknown>): void {
  try {
    if (attrs === undefined) {
      void globalThis.__IMAGEN_PS_BOOTSTRAP_LOG__?.failure(event, error);
      return;
    }
    void globalThis.__IMAGEN_PS_BOOTSTRAP_LOG__?.failure(event, error, attrs);
  } catch {
    // bootstrap 诊断不能影响真实面板启动。
  }
}

let panelRuntime: ReturnType<typeof createImagenPanelRuntime> | undefined;

try {
  const modules = resolveUxpModules();
  installBundleBootstrapLogger(modules);
  bootstrapCheckpoint('panel.bootstrap.bundle.start', {
    hasDocument: typeof document !== 'undefined',
  });
  bootstrapCheckpoint('panel.bootstrap.modules.resolved', {
    hasUxp: Boolean(modules.uxp),
    hasPhotoshop: Boolean(modules.photoshop),
    hasEntrypoints: typeof (modules.uxp as { entrypoints?: { setup?: unknown } } | undefined)?.entrypoints?.setup === 'function',
  });

  // UXPDT reload 可能复用同一个 JS context；先销毁旧 panel runtime，再安装本次入口。
  disposePreviousPanelRuntime();
  bootstrapCheckpoint('panel.bootstrap.previous_runtime.disposed');

  panelRuntime = createImagenPanelRuntime();
  globalThis.__IMAGEN_PS_PANEL_RUNTIME__ = panelRuntime;
  bootstrapCheckpoint('panel.bootstrap.runtime.created');

  const installedEntrypoints = installUxpPanelEntrypoints(panelRuntime, modules);
  bootstrapCheckpoint('panel.bootstrap.entrypoints.installed', { installed: installedEntrypoints });
  if (!installedEntrypoints && typeof document !== 'undefined') {
    bootstrapCheckpoint('panel.bootstrap.fallback_mount.start');
    panelRuntime.mount(document.getElementById('root'));
    bootstrapCheckpoint('panel.bootstrap.fallback_mount.complete', { hasHost: Boolean(panelRuntime.host) });
  }
} catch (error) {
  bootstrapFailure('panel.bootstrap.bundle.failed', error);
  throw error;
}

export const pluginHost = panelRuntime?.host;
export default pluginHost;

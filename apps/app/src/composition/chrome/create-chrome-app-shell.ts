import {
  setAssetStore,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
} from '@imagen-ps/application';
import { createCommandsAdapter } from '../../shared/ports/commands-port';
import type { AppShellHost } from '../../shared/ui/app-shell';
import type { DiagnosticsPort } from '../../shared/ports/diagnostics-port';
import { createPluginAppModel } from '../../shared/domain/plugin-app-model';
import { createChromeHostPort, type ChromeFilePicker } from '../../adapters/chrome/chrome-host-port';
import {
  createChromeIndexedDbStorage,
  type ChromeKeyValueBackend,
} from '../../adapters/chrome/indexed-db-storage';
import { createPhotoshopSimulator, type PhotoshopSimulatorScenarioId } from '../../simulators/photoshop/simulator';
import { createChromeTestHarnessRuntime, type ChromeTestHarnessConfig } from './chrome-test-harness';

export interface ChromeAppShellOptions {
  readonly backend?: ChromeKeyValueBackend;
  readonly filePicker?: ChromeFilePicker;
  readonly scenario?: PhotoshopSimulatorScenarioId;
  readonly testHarness?: ChromeTestHarnessConfig;
}

function createBrowserFilePicker(): ChromeFilePicker {
  return {
    pick: async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      return new Promise<File | undefined>((resolve) => {
        input.onchange = () => resolve(input.files?.[0]);
        input.oncancel = () => resolve(undefined);
        input.click();
      });
    },
  };
}

function createChromeDiagnosticsPort(): DiagnosticsPort {
  const records: Array<{ readonly event: string; readonly attrs?: Record<string, unknown> }> = [];
  globalThis.__IMAGEN_CHROME_DIAGNOSTICS__ = records;
  return {
    async checkpoint(event, attrs) {
      records.push({ event, attrs });
      console.debug('[imagen-ps:chrome]', event, attrs ?? {});
    },
    async failure(event, error, attrs) {
      records.push({ event, attrs });
      console.error('[imagen-ps:chrome]', event, error, attrs ?? {});
    },
  };
}

/**
 * Chrome composition 只装配 browser adapter 和 simulator；React UI 仍由 shared
 * AppShell 提供，避免浏览器 shell 复制 UXP 页面。
 */
export function createChromeAppShell(options?: ChromeAppShellOptions): AppShellHost {
  const testHarness = options?.testHarness ? createChromeTestHarnessRuntime(options.testHarness) : undefined;
  const storage = createChromeIndexedDbStorage({ backend: options?.backend ?? testHarness?.backend });
  setProviderProfileRepository(storage.profiles);
  setSecretStorageAdapter(storage.secrets);
  setJobHistoryStore(storage.history);
  setAssetStore(storage.assets);

  const simulator = createPhotoshopSimulator(options?.scenario ?? testHarness?.scenario ?? 'seeded-document');
  const host = createChromeHostPort({
    simulator,
    filePicker: options?.filePicker ?? testHarness?.filePicker ?? createBrowserFilePicker(),
  });
  testHarness?.install(storage);

  return {
    app: createPluginAppModel('chrome-browser'),
    locale: 'en',
    services: {
      commands: createCommandsAdapter(),
      host,
      diagnostics: createChromeDiagnosticsPort(),
    },
    dispose() {
      globalThis.__IMAGEN_CHROME_DIAGNOSTICS__ = undefined;
      globalThis.__IMAGEN_CHROME_TEST_HARNESS__ = undefined;
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_CHROME_DIAGNOSTICS__: Array<{ readonly event: string; readonly attrs?: Record<string, unknown> }> | undefined;
}

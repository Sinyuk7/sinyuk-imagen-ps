import {
  setAssetStore,
  setJobHistoryStore,
  setModelDiscoveryCacheRepository,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setTaskStore,
  setUserModelConfigRepository,
} from '@imagen-ps/application';
import { createCommandsAdapter } from '../../shared/ports/commands-port';
import type { AppShellHost } from '../../shared/ui/app-shell';
import type { DiagnosticsPort } from '../../shared/ports/diagnostics-port';
import { createPluginAppModel } from '../../shared/domain/plugin-app-model';
import { createStaticAppPathInfoPort } from '../../shared/ports/app-path-info';
import { createChromeHostPort, type ChromeFilePicker } from '../../adapters/chrome/chrome-host-port';
import {
  createChromeIndexedDbStorage,
  type ChromeKeyValueBackend,
} from '../../adapters/chrome/indexed-db-storage';
import { createPhotoshopSimulator, type PhotoshopSimulatorScenarioId } from '../../simulators/photoshop/simulator';
import { createMemoryThumbnailStore } from '../../shared/image/thumbnail-store';
import { createTaskResourceResolver } from '../../shared/image/task-resource-resolver';
import { createRetentionController } from '../../shared/retention/controller';
import { defaultTaskLinkedRetentionPolicy, runTaskLinkedRetention } from '../../shared/retention/task-linked-retention';
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

const CHROME_PATH_INFO = createStaticAppPathInfoPort({
  logPath: 'Browser runtime only: inspect DevTools console or window.__IMAGEN_CHROME_DIAGNOSTICS__',
  generatedImagePath: 'Browser IndexedDB asset store (no native filesystem path)',
});

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
  setTaskStore(storage.tasks);
  setAssetStore(storage.assets);
  setModelDiscoveryCacheRepository(storage.modelDiscovery);
  setUserModelConfigRepository(storage.userModelConfigs);

  const simulator = createPhotoshopSimulator(storage.assets, options?.scenario ?? testHarness?.scenario ?? 'seeded-document');
  const host = createChromeHostPort({
    assetStore: storage.assets,
    simulator,
    filePicker: options?.filePicker ?? testHarness?.filePicker ?? createBrowserFilePicker(),
  });
  testHarness?.install(storage);
  const commands = createCommandsAdapter();
  const retention = createRetentionController({
    async sweep() {
      await runTaskLinkedRetention(
        { taskStore: storage.tasks, jobHistoryStore: storage.history, assetStore: storage.assets },
        defaultTaskLinkedRetentionPolicy(),
      );
    },
    onError(error, reason) {
      console.error('[imagen-ps:chrome]', 'retention.sweep.fail', reason, error);
    },
  });
  void retention.requestSweep('startup');

  return {
    app: createPluginAppModel('chrome-browser'),
    locale: 'en',
    services: {
      commands: testHarness?.wrapCommands(commands) ?? commands,
      host,
      generationSettings: storage.generationSettings,
      promptSettings: storage.promptSettings,
      activeImageProfile: storage.activeImageProfile,
      pathInfo: CHROME_PATH_INFO,
      thumbnails: createMemoryThumbnailStore({ resolveStoredRef: storage.assets.resolve }),
      taskResources: createTaskResourceResolver({ resolveStoredRef: storage.assets.resolve }),
      diagnostics: createChromeDiagnosticsPort(),
      retention,
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

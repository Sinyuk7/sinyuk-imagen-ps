import {
  setAssetStore,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  configureRuntimeLogging,
  getRuntimeLogger,
} from '@imagen-ps/application';
import { createCompositeSink, createConsoleSink } from '@imagen-ps/foundation';
import { createCommandsAdapter } from '../../app-services/commands-port';
import type { AppServices } from '../../app-services/app-services';
import type { DiagnosticsPort } from '../../shared/ports/diagnostics-port';
import { createPluginAppModel, type PluginAppModel } from '../../shared/plugin-app-model';
import { normalizeLocale, type SupportedLocale } from '../../shared/locale';
import { createPhotoshopHostBridge } from '../../adapters/uxp/photoshop-host-bridge';
import { resolveUxpModules } from '../../adapters/uxp/uxp-api';
import { createUxpAssetStore, createUxpJobHistoryStore } from '../../adapters/uxp/uxp-job-history-adapter';
import { createUxpProviderProfileRepository } from '../../adapters/uxp/uxp-provider-profile-repository';
import { createUxpSecretStorageAdapter } from '../../adapters/uxp/uxp-secret-storage-adapter';
import { createUxpLogSink, writeUxpUiCheckpoint, writeUxpUiFailure } from '../../adapters/uxp/uxp-log-sink';

export interface PluginHostShell {
  readonly kind: 'photoshop-uxp' | 'chrome-browser';
  readonly app: PluginAppModel;
  readonly locale: SupportedLocale;
  readonly services: AppServices;
  dispose(): void;
}

function createUxpDiagnosticsPort(): DiagnosticsPort {
  return {
    checkpoint: writeUxpUiCheckpoint,
    failure: writeUxpUiFailure,
  };
}

export function createPluginHostShell(): PluginHostShell {
  const uxpModules = resolveUxpModules();

  // UXP 日志：data-folder 持久化 + console 即时镜像。
  // 使用 foundation 日志格式与语义，sink 由 UXP host adapter 提供。
  configureRuntimeLogging(
    createCompositeSink([
      createUxpLogSink(uxpModules),
      createConsoleSink({ log: console.log }),
    ]),
    'uxp',
  );

  const logger = getRuntimeLogger().child({ package: 'app', component: 'host' });
  const span = logger.startSpan('panel.startup');

  try {
    const profileRepository = createUxpProviderProfileRepository(uxpModules);
    const secretStorage = createUxpSecretStorageAdapter(uxpModules);
    const jobHistoryStore = createUxpJobHistoryStore(uxpModules);
    const assetStore = createUxpAssetStore(uxpModules);

    logger.info('panel.adapters.initialized', {
      hasProfileRepository: true,
      hasSecretStorage: true,
      hasJobHistoryStore: true,
      hasAssetStore: true,
    });

    setProviderProfileRepository(profileRepository);
    setSecretStorageAdapter(secretStorage);
    setJobHistoryStore(jobHistoryStore);
    setAssetStore(assetStore);

    const hostBridge = createPhotoshopHostBridge(uxpModules, { logger: logger.child({ component: 'host' }) });

    span.finish();
    logger.info('panel.startup.complete');

    return {
      kind: 'photoshop-uxp',
      app: createPluginAppModel(),
      locale: normalizeLocale(uxpModules.uxp?.host?.uiLocale),
      services: {
        commands: createCommandsAdapter(),
        host: hostBridge,
        diagnostics: createUxpDiagnosticsPort(),
      },
      dispose() {
        logger.info('panel.dispose');
      },
    };
  } catch (error) {
    span.fail(error);
    logger.error('panel.startup.failed');
    throw error;
  }
}

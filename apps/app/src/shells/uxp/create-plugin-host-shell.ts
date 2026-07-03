import {
  setAssetStore,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setTaskStore,
  configureRuntimeLogging,
  getRuntimeLogger,
} from '@imagen-ps/application';
import { createCompositeSink, createConsoleSink } from '@imagen-ps/foundation';
import { createCommandsAdapter } from '../../app-services/commands-port';
import type { AppServices } from '../../app-services/app-services';
import { createStaticAppPathInfoPort } from '../../shared/ports/app-path-info';
import type { DiagnosticsPort } from '../../shared/ports/diagnostics-port';
import { createPluginAppModel, type PluginAppModel } from '../../shared/plugin-app-model';
import { normalizeLocale, type SupportedLocale } from '../../shared/locale';
import {
  createPhotoshopHostBridge,
  createPhotoshopHostModalRunner,
  createPhotoshopThumbnailGenerator,
} from '../../adapters/uxp/photoshop-host-bridge';
import { resolveUxpModules } from '../../adapters/uxp/uxp-api';
import { createUxpAssetStore, createUxpJobHistoryStore, createUxpTaskStore } from '../../adapters/uxp/uxp-job-history-adapter';
import { createUxpStorageAdmin } from '../../adapters/uxp/uxp-job-history-adapter';
import { createUxpActiveImageProfileStore } from '../../adapters/uxp/uxp-active-image-profile-store';
import { createUxpProviderProfileRepository } from '../../adapters/uxp/uxp-provider-profile-repository';
import { createUxpSecretStorageAdapter } from '../../adapters/uxp/uxp-secret-storage-adapter';
import { createInMemoryGenerationSettingsStore } from '../../adapters/uxp/in-memory-host-storage';
import { cleanupUxpLogs, createUxpLogSink, writeUxpUiCheckpoint, writeUxpUiFailure } from '../../adapters/uxp/uxp-log-sink';
import { createMemoryThumbnailStore } from '../../shared/image/thumbnail-store';
import { createTaskResourceResolver } from '../../shared/image/task-resource-resolver';
import { createRetentionController } from '../../shared/retention/controller';
import { defaultTaskLinkedRetentionPolicy, runTaskLinkedRetention } from '../../shared/retention/task-linked-retention';

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

function createUxpFallbackPathInfoPort() {
  return createStaticAppPathInfoPort({
    logPath: 'data-folder/logs/YYYY-MM-DD/imagen.jsonl',
    generatedImagePath: 'data-folder/uxp-asset-*',
  });
}

async function resolveUxpPathInfo(uxpModules: ReturnType<typeof resolveUxpModules>): Promise<{
  readonly logPath: string;
  readonly generatedImagePath: string;
}> {
  const localFileSystem = (uxpModules.uxp?.storage as {
    readonly localFileSystem?: { getDataFolder(): Promise<{ readonly nativePath?: string }> };
  } | undefined)?.localFileSystem;
  if (!localFileSystem) {
    return createUxpFallbackPathInfoPort().getPathInfo();
  }
  const dataFolder = await localFileSystem.getDataFolder();
  const basePath = typeof dataFolder.nativePath === 'string' && dataFolder.nativePath.length > 0
    ? dataFolder.nativePath
    : 'data-folder';
  const today = new Date().toISOString().slice(0, 10);
  return {
    logPath: `${basePath}/logs/${today}/imagen.jsonl`,
    generatedImagePath: `${basePath}/uxp-asset-*`,
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
    const taskStore = createUxpTaskStore(uxpModules);
    const assetStore = createUxpAssetStore(uxpModules);
    const storageAdmin = createUxpStorageAdmin(uxpModules);
    const generationSettings = createInMemoryGenerationSettingsStore();
    const activeImageProfile = createUxpActiveImageProfileStore(uxpModules);

    logger.info('panel.adapters.initialized', {
      hasProfileRepository: true,
      hasSecretStorage: true,
      hasJobHistoryStore: true,
      hasTaskStore: true,
      hasAssetStore: true,
    });

    setProviderProfileRepository(profileRepository);
    setSecretStorageAdapter(secretStorage);
    setJobHistoryStore(jobHistoryStore);
    setTaskStore(taskStore);
    setAssetStore(assetStore);

    const hostLogger = logger.child({ component: 'host' });
    const retentionPolicy = defaultTaskLinkedRetentionPolicy();
    const retention = createRetentionController({
      async sweep(reason) {
        const summary = await runTaskLinkedRetention({ taskStore, jobHistoryStore, assetStore }, retentionPolicy);
        const logSummary = await cleanupUxpLogs(uxpModules, { maxDays: 3, maxBytesPerDay: 256 * 1024 });
        hostLogger.info('retention.sweep.ok', {
          reason,
          ...summary,
          ...logSummary,
          knownAssetRefs: storageAdmin ? (await storageAdmin.listAssetRefs()).length : undefined,
        });
      },
      onError(error, reason) {
        hostLogger.error('retention.sweep.fail', { reason });
        void writeUxpUiFailure('retention.sweep.fail', error, { reason });
      },
    });
    const executeHostModal = createPhotoshopHostModalRunner(uxpModules, hostLogger);
    const hostBridge = createPhotoshopHostBridge(uxpModules, { logger: hostLogger, executeHostModal });
    const createThumbnail = createPhotoshopThumbnailGenerator(uxpModules, {
      logger: hostLogger,
      executeHostModal,
    });

    span.finish();
    logger.info('panel.startup.complete');
    void retention.requestSweep('startup');

    return {
      kind: 'photoshop-uxp',
      app: createPluginAppModel(),
      locale: normalizeLocale(uxpModules.uxp?.host?.uiLocale),
      services: {
        commands: createCommandsAdapter(),
        host: hostBridge,
        generationSettings,
        activeImageProfile,
        pathInfo: {
          getPathInfo: async () => resolveUxpPathInfo(uxpModules),
        },
        thumbnails: createMemoryThumbnailStore({ resolveStoredRef: assetStore.resolve, createThumbnail }),
        taskResources: createTaskResourceResolver({ resolveStoredRef: assetStore.resolve }),
        diagnostics: createUxpDiagnosticsPort(),
        retention,
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

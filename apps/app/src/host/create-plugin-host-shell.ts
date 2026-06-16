import {
  setAssetStore,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  configureRuntimeLogging,
} from '@imagen-ps/application';
import { createCompositeSink, createConsoleSink } from '@imagen-ps/foundation';
import { createCommandsAdapter } from '../app-services/commands-port';
import type { AppServices } from '../app-services/app-services';
import { createPluginAppModel, type PluginAppModel } from '../shared/plugin-app-model';
import { createPhotoshopHostBridge } from './photoshop-host-bridge';
import { resolveUxpModules } from './uxp-api';
import { createUxpAssetStore, createUxpJobHistoryStore } from './uxp-job-history-adapter';
import { createUxpProviderProfileRepository } from './uxp-provider-profile-repository';
import { createUxpSecretStorageAdapter } from './uxp-secret-storage-adapter';
import { createUxpLogSink } from './uxp-log-sink';

export interface PluginHostShell {
  readonly kind: 'photoshop-uxp';
  readonly app: PluginAppModel;
  readonly services: AppServices;
}

export function createPluginHostShell(): PluginHostShell {
  const uxpModules = resolveUxpModules();
  const profileRepository = createUxpProviderProfileRepository(uxpModules);
  const secretStorage = createUxpSecretStorageAdapter(uxpModules);
  const jobHistoryStore = createUxpJobHistoryStore(uxpModules);
  const assetStore = createUxpAssetStore(uxpModules);

  // UXP 日志：data-folder 持久化 + console 即时镜像。
  // 两者与 CLI 共享同一套 foundation 日志格式与语义，只有 sink 不同。
  configureRuntimeLogging(
    createCompositeSink([
      createUxpLogSink(uxpModules),
      createConsoleSink({ log: console.log }),
    ]),
    'uxp',
  );

  setProviderProfileRepository(profileRepository);
  setSecretStorageAdapter(secretStorage);
  setJobHistoryStore(jobHistoryStore);
  setAssetStore(assetStore);

  return {
    kind: 'photoshop-uxp',
    app: createPluginAppModel(),
    services: {
      commands: createCommandsAdapter(),
      host: createPhotoshopHostBridge(uxpModules),
    },
  };
}

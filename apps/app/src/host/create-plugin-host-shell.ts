import {
  setAssetStore,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
} from '@imagen-ps/application';
import { createCommandsAdapter } from '../app-services/commands-port';
import type { AppServices } from '../app-services/app-services';
import { createPluginAppModel, type PluginAppModel } from '../shared/plugin-app-model';
import { createPhotoshopHostBridge } from './photoshop-host-bridge';
import { resolveUxpModules } from './uxp-api';
import { createUxpAssetStore, createUxpJobHistoryStore } from './uxp-job-history-adapter';
import { createUxpProviderProfileRepository } from './uxp-provider-profile-repository';
import { createUxpSecretStorageAdapter } from './uxp-secret-storage-adapter';

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

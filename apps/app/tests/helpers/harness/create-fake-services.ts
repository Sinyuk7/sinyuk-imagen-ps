import type { OfficialModelPreset, ProfileModelItem, ProviderProfile, UserModelConfig } from '@imagen-ps/application';
import { createMemoryActiveImageProfileStore } from '../../../src/shared/ports/active-image-profile';
import type { DiagnosticsPort } from '../../../src/shared/ports/diagnostics-port';
import { createMemoryGenerationSettingsStore, type AppGenerationSettings } from '../../../src/shared/ports/app-generation-settings';
import { createMemoryPromptSettingsStore, type PromptSettings } from '../../../src/shared/ports/prompt-settings';
import { createCommandsFake } from './commands.fake';
import { createHostFake } from './host.fake';
import { createTaskResourceThumbnailHelper } from './task-resource-thumbnail.helper';

export function createFakeServices(options?: {
  readonly profiles?: readonly ProviderProfile[];
  readonly userModelConfigs?: readonly UserModelConfig[];
  readonly officialModelConfigPresets?: readonly OfficialModelPreset[];
  readonly profileModelItems?: readonly ProfileModelItem[];
  readonly generationSettings?: Partial<AppGenerationSettings>;
  readonly promptSettings?: PromptSettings | null;
  readonly activeImageProfileId?: string | null;
}) {
  const commandsFake = createCommandsFake({
    profiles: options?.profiles,
    userModelConfigs: options?.userModelConfigs,
    officialModelConfigPresets: options?.officialModelConfigPresets,
    profileModelItems: options?.profileModelItems,
  });
  const hostFake = createHostFake();
  const taskResourceHelper = createTaskResourceThumbnailHelper();
  const diagnostics: DiagnosticsPort = {
    async checkpoint(event, attrs) {
      if (globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__) {
        return;
      }
      await globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__?.checkpoint(event, attrs);
    },
    async failure(event, error, attrs) {
      if (globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__) {
        return;
      }
      await globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__?.fail(event, error, attrs);
    },
  };

  return {
    services: {
      commands: commandsFake.commands,
      host: hostFake.host,
      generationSettings: createMemoryGenerationSettingsStore(options?.generationSettings),
      modelGenerationPreferences: commandsFake.modelGenerationPreferences,
      promptSettings: createMemoryPromptSettingsStore(options?.promptSettings),
      activeImageProfile: createMemoryActiveImageProfileStore(options?.activeImageProfileId),
      pathInfo: taskResourceHelper.pathInfo,
      thumbnails: taskResourceHelper.thumbnails,
      taskResources: taskResourceHelper.taskResources,
      diagnostics,
    },
    spies: {
      ...commandsFake.spies,
      ...hostFake.spies,
      ...taskResourceHelper.spies,
    },
  };
}

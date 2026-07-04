import type { CommandsPort } from './commands-port';
import type { DiagnosticsPort } from './diagnostics-port';
import type { HostBridge } from './host-port';
import type { AppGenerationSettingsStore } from './app-generation-settings';
import type { PromptSettingsStore } from './prompt-settings';
import type { ActiveImageProfileStore } from './active-image-profile';
import type { AppPathInfoPort } from './app-path-info';
import type { ThumbnailStore } from '../image/thumbnail-store';
import type { ResolvedTaskResource, TaskResourceRef } from '@imagen-ps/application';
import type { RetentionPort } from '../retention/controller';

export interface TaskResourceResolverPort {
  resolve(resource: TaskResourceRef): Promise<ResolvedTaskResource>;
}

export interface AppServices {
  readonly commands: CommandsPort;
  readonly host: HostBridge;
  readonly generationSettings: AppGenerationSettingsStore;
  readonly promptSettings: PromptSettingsStore;
  readonly activeImageProfile: ActiveImageProfileStore;
  readonly pathInfo?: AppPathInfoPort;
  readonly thumbnails?: ThumbnailStore;
  readonly taskResources?: TaskResourceResolverPort;
  readonly diagnostics?: DiagnosticsPort;
  readonly retention?: RetentionPort;
}

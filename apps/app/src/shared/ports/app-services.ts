import type { CommandsPort } from './commands-port';
import type { DiagnosticsPort } from './diagnostics-port';
import type { HostBridge } from './host-port';
import type { AppGenerationSettingsStore } from './app-generation-settings';
import type { AppModelGenerationPreferenceRepository } from './model-generation-preferences';
import type { PromptSettingsStore } from './prompt-settings';
import type { ActiveImageProfileStore } from './active-image-profile';
import type { AppPathInfoPort } from './app-path-info';
import type { ThumbnailStore } from '../image/thumbnail-store';
import type { GenerationBackend, ResolvedTaskResource, TaskResourceRef } from '@imagen-ps/application';
import type { RetentionPort } from '../retention/controller';
import type { ComfyUiManagementPort } from './comfyui-management';

export interface TaskResourceResolverPort {
  resolve(resource: TaskResourceRef): Promise<ResolvedTaskResource>;
}

export interface AppServices {
  readonly commands: CommandsPort;
  /** ComfyUI 设置只经由 Application 管理服务读写。 */
  readonly comfyUi: ComfyUiManagementPort;
  /** 测试或宿主 composition 可显式替换 Session backend registry。 */
  readonly generationBackends?: readonly GenerationBackend[];
  readonly host: HostBridge;
  readonly generationSettings: AppGenerationSettingsStore;
  readonly modelGenerationPreferences: AppModelGenerationPreferenceRepository;
  readonly promptSettings: PromptSettingsStore;
  readonly activeImageProfile: ActiveImageProfileStore;
  readonly pathInfo?: AppPathInfoPort;
  readonly thumbnails?: ThumbnailStore;
  readonly taskResources?: TaskResourceResolverPort;
  readonly diagnostics?: DiagnosticsPort;
  readonly retention?: RetentionPort;
}

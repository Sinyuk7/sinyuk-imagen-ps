import type { CommandsPort } from './commands-port';
import type { DiagnosticsPort } from './diagnostics-port';
import type { HostBridge } from './host-port';
import type { ThumbnailStore } from '../image/thumbnail-store';

export interface AppServices {
  readonly commands: CommandsPort;
  readonly host: HostBridge;
  readonly thumbnails?: ThumbnailStore;
  readonly diagnostics?: DiagnosticsPort;
}

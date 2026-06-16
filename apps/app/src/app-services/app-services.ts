import type { CommandsPort } from './commands-port';
import type { HostBridge } from './host-bridge';

export interface AppServices {
  readonly commands: CommandsPort;
  readonly host: HostBridge;
}

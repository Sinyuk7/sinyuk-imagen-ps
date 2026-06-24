import type { CommandsPort } from './commands-port';
import type { DiagnosticsPort } from './diagnostics-port';
import type { HostBridge } from './host-port';

export interface AppServices {
  readonly commands: CommandsPort;
  readonly host: HostBridge;
  readonly diagnostics?: DiagnosticsPort;
}

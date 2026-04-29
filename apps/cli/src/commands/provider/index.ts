import type { Command } from 'commander';
import { registerProviderList } from './list.js';
import { registerProviderDescribe } from './describe.js';
import { registerProviderConfigGet } from './config-get.js';
import { registerProviderConfigSave } from './config-save.js';
import { registerProviderConfigInteractive } from './config-interactive.js';

export function registerProviderCommands(program: Command): void {
  const provider = program.command('provider').description('Manage image generation providers');

  registerProviderList(provider);
  registerProviderDescribe(provider);

  // config sub-command group
  const config = provider.command('config').description('Manage provider configuration (no args: interactive setup)');

  registerProviderConfigGet(config);
  registerProviderConfigSave(config);
  registerProviderConfigInteractive(config);
}

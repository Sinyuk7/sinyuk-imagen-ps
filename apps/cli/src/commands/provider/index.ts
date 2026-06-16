import type { Command } from 'commander';
import { registerProviderList } from './list.js';
import { registerProviderDescribe } from './describe.js';

export function registerProviderCommands(program: Command): void {
  const provider = program.command('provider').description('Manage image generation providers');

  registerProviderList(provider);
  registerProviderDescribe(provider);
}

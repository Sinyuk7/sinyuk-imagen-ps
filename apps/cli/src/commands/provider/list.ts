import type { Command } from 'commander';
import { listProviders } from '@imagen-ps/application';
import { success } from '../../utils/output.js';

export function registerProviderList(parent: Command): void {
  parent
    .command('list')
    .description('List all registered providers')
    .action(() => {
      const providers = listProviders();
      success(providers);
    });
}

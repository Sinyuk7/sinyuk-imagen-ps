import type { Command } from 'commander';
import { describeProvider } from '@imagen-ps/shared-commands';
import { success, error } from '../../utils/output.js';

export function registerProviderDescribe(parent: Command): void {
  parent
    .command('describe <providerId>')
    .description('Describe a specific provider')
    .action((providerId: string) => {
      const descriptor = describeProvider(providerId);
      if (!descriptor) {
        error(`Provider not found: ${providerId}`);
      }
      success(descriptor);
    });
}

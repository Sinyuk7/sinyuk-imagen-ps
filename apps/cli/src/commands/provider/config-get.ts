import type { Command } from 'commander';
import { getProviderConfig } from '@imagen-ps/shared-commands';
import { success, error } from '../../utils/output.js';

export function registerProviderConfigGet(configCmd: Command): void {
  configCmd
    .command('get <providerId>')
    .description('Get saved configuration for a provider')
    .action(async (providerId: string) => {
      try {
        const result = await getProviderConfig(providerId);
        if (!result.ok) {
          error(result.error.message);
        }
        success(result.value);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }
    });
}

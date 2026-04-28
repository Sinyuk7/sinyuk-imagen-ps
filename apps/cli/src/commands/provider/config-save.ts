import type { Command } from 'commander';
import { saveProviderConfig } from '@imagen-ps/shared-commands';
import { parseJsonInput } from '../../utils/input.js';
import { success, error } from '../../utils/output.js';

export function registerProviderConfigSave(configCmd: Command): void {
  configCmd
    .command('save <providerId> <configJson>')
    .description('Save configuration for a provider (JSON string or @file)')
    .action(async (providerId: string, configJson: string) => {
      let parsed: unknown;
      try {
        parsed = parseJsonInput(configJson);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }

      try {
        const result = await saveProviderConfig(providerId, parsed);
        if (!result.ok) {
          error(result.error.message);
        }
        success({ ok: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }
    });
}

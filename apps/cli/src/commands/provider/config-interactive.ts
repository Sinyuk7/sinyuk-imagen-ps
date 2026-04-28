import * as readline from 'node:readline';
import type { Command } from 'commander';
import { listProviders, saveProviderConfig } from '@imagen-ps/shared-commands';
import { error } from '../../utils/output.js';

/**
 * Minimal interactive bootstrap shortcut for provider configuration.
 * Allows the user to select a provider and input basic config fields.
 */
export function registerProviderConfigInteractive(configCmd: Command): void {
  // When 'config' is invoked without sub-command (get/save), run interactive mode
  configCmd.action(async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // prompts go to stderr so stdout stays clean
    });

    const ask = (question: string): Promise<string> => new Promise((resolve) => rl.question(question, resolve));

    try {
      const providers = listProviders();
      if (providers.length === 0) {
        rl.close();
        error('No providers registered');
      }

      // Display available providers
      process.stderr.write('\nAvailable providers:\n');
      providers.forEach((p, i) => {
        process.stderr.write(`  ${i + 1}. ${p.id} (${p.displayName})\n`);
      });
      process.stderr.write('\n');

      const choice = await ask('Select provider number: ');
      const index = parseInt(choice, 10) - 1;
      if (isNaN(index) || index < 0 || index >= providers.length) {
        rl.close();
        error('Invalid selection');
      }

      const provider = providers[index]!;
      const providerId = provider.id;

      process.stderr.write(`\nConfiguring: ${provider.displayName} (${providerId})\n\n`);

      const apiKey = await ask('API Key: ');
      const baseURL = await ask('Base URL (press Enter to skip): ');
      const defaultModel = await ask('Default model (press Enter to skip): ');

      rl.close();

      const config: Record<string, unknown> = {
        providerId,
        displayName: provider.displayName,
        family: provider.family,
        apiKey,
      };

      if (baseURL.trim()) {
        config['baseURL'] = baseURL.trim();
      }
      if (defaultModel.trim()) {
        config['defaultModel'] = defaultModel.trim();
      }

      const result = await saveProviderConfig(providerId, config);
      if (!result.ok) {
        error(result.error.message);
      }

      process.stdout.write(JSON.stringify({ ok: true, providerId }) + '\n');
      process.exit(0);
    } catch (err: unknown) {
      rl.close();
      const msg = err instanceof Error ? err.message : String(err);
      error(msg);
    }
  });
}

import type { Command } from 'commander';
import { saveProviderProfile } from '@imagen-ps/application';
import { error, success } from '../../utils/output.js';

function failUnknown(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  error(msg);
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('创建本地 mock profile，用于零成本 CLI contract 验证')
    .requiredOption('--mock', '创建或更新内置 mock profile')
    .action(async () => {
      try {
        const result = await saveProviderProfile({
          profileId: 'mock-dev',
          providerId: 'mock',
          displayName: 'Mock Dev',
          config: {
            providerId: 'mock',
            family: 'image-endpoint',
            displayName: 'Mock Dev',
            baseURL: 'https://mock.local',
            defaultModel: 'mock-image-v1',
          },
          secretValues: {
            apiKey: 'sk-mock',
          },
        });
        if (!result.ok) {
          error(result.error.message);
        }
        success({ profile: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });
}

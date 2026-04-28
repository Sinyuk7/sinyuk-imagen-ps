import type { Command } from 'commander';
import { retryJob } from '@imagen-ps/shared-commands';
import { success, error } from '../../utils/output.js';

export function registerJobRetry(parent: Command): void {
  parent
    .command('retry <jobId>')
    .description('Retry a failed job (current process runtime store only)')
    .action(async (jobId: string) => {
      try {
        const result = await retryJob(jobId);
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

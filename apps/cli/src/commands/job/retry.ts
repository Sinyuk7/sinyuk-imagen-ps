import type { Command } from 'commander';
import { success, error } from '../../utils/output.js';
import { getCliSession } from './session.js';

export function registerJobRetry(parent: Command): void {
  parent
    .command('retry <jobId>')
    .description('Retry a failed job from the active session or durable history')
    .action(async (jobId: string) => {
      try {
        const result = await getCliSession().retryJob(jobId);
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

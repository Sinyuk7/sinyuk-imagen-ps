import type { Command } from 'commander';
import { success, error } from '../../utils/output.js';
import { getCliSession } from './session.js';

export function registerJobGet(parent: Command): void {
  parent
    .command('get <jobId>')
    .description('Get job status (current process runtime store only)')
    .action((jobId: string) => {
      const job = getCliSession().getSnapshot().jobs.find((item) => item.id === jobId);
      if (!job) {
        error(`Job not found: ${jobId}. Note: only jobs from the current process are visible.`);
      }
      success(job);
    });
}

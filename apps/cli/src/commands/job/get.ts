import type { Command } from 'commander';
import { getJob } from '@imagen-ps/shared-commands';
import { success, error } from '../../utils/output.js';

export function registerJobGet(parent: Command): void {
  parent
    .command('get <jobId>')
    .description('Get job status (current process runtime store only)')
    .action((jobId: string) => {
      const job = getJob(jobId);
      if (!job) {
        error(`Job not found: ${jobId}. Note: only jobs from the current process are visible.`);
      }
      success(job);
    });
}

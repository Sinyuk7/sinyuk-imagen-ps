import type { Command } from 'commander';
import { getJobHistoryRecord } from '@imagen-ps/application/commands';
import { success, error } from '../../utils/output.js';
import { getCliSession } from './session.js';

export function registerJobGet(parent: Command): void {
  parent
    .command('get <jobId>')
    .description('Get job status from the active session, then durable history')
    .action(async (jobId: string) => {
      const job = getCliSession().getSnapshot().jobs.find((item) => item.id === jobId);
      if (job) {
        return success({ source: 'session', job });
      }

      const record = await getJobHistoryRecord(jobId);
      if (!record) {
        return error(`Job not found: ${jobId}.`);
      }
      return success({ source: 'durable', record });
    });
}

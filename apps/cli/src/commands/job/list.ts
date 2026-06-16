import type { Command } from 'commander';
import { listJobHistoryRecords } from '@imagen-ps/application/commands';
import { success, error } from '../../utils/output.js';

interface JobListOptions {
  readonly limit?: string;
  readonly status?: string;
}

type DurableJobStatus = 'completed' | 'failed';

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    error('--limit must be a positive integer');
  }
  return parsed;
}

function parseStatus(value: string | undefined): DurableJobStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'completed' || value === 'failed') {
    return value;
  }
  error('--status must be one of: completed, failed');
}

export function registerJobList(parent: Command): void {
  parent
    .command('list')
    .description('List durable job history records')
    .option('--limit <count>', '最多返回多少条 durable record')
    .option('--status <status>', '按 terminal status 过滤：completed 或 failed')
    .action(async (options: JobListOptions) => {
      const limit = parseLimit(options.limit);
      const status = parseStatus(options.status);
      const records = await listJobHistoryRecords({
        ...(limit !== undefined ? { limit } : {}),
        ...(status !== undefined ? { status } : {}),
      });
      success({ records });
    });
}

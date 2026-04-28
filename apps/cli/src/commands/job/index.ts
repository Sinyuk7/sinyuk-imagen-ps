import type { Command } from 'commander';
import { registerJobSubmit } from './submit.js';
import { registerJobGet } from './get.js';
import { registerJobRetry } from './retry.js';

export function registerJobCommands(program: Command): void {
  const job = program.command('job').description('Manage generation jobs');

  registerJobSubmit(job);
  registerJobGet(job);
  registerJobRetry(job);
}

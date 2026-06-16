import type { Command } from 'commander';
import { parseJsonInput } from '../../utils/input.js';
import { error } from '../../utils/output.js';
import { executeCliJob } from './executor.js';

export function registerJobSubmit(parent: Command): void {
  parent
    .command('submit <workflow> <inputJson>')
    .description('Submit a new job (inputJson: JSON string or @file)')
    .option('--out <dir>', 'Write produced image assets + sidecar metadata into <dir>')
    .action(async (workflow: string, inputJson: string, options: { out?: string }) => {
      let input: unknown;
      try {
        input = parseJsonInput(inputJson);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }

      await executeCliJob(workflow, input as Record<string, unknown>, options);
    });
}

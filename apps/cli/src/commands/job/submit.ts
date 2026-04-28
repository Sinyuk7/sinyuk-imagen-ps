import type { Command } from 'commander';
import { submitJob } from '@imagen-ps/shared-commands';
import { parseJsonInput } from '../../utils/input.js';
import { success, error } from '../../utils/output.js';

export function registerJobSubmit(parent: Command): void {
  parent
    .command('submit <workflow> <inputJson>')
    .description('Submit a new job (inputJson: JSON string or @file)')
    .action(async (workflow: string, inputJson: string) => {
      let input: unknown;
      try {
        input = parseJsonInput(inputJson);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }

      try {
        const result = await submitJob({
          workflow: workflow as never,
          input: input as Record<string, unknown>,
        });
        if (!result.ok) {
          // Job submission itself failed at command level
          error(result.error.message);
        }
        // Output the Job object (may have status: 'failed' — that's a business result)
        success(result.value);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(msg);
      }
    });
}

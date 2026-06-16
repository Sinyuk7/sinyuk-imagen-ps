#!/usr/bin/env node

import { Command } from 'commander';
import { setProviderProfileRepository, setSecretStorageAdapter } from '@imagen-ps/application';
import { FileProviderProfileRepository, FileSecretStorageAdapter } from './adapters/file-provider-profile-adapter.js';
import { registerProviderCommands } from './commands/provider/index.js';
import { registerProfileCommands } from './commands/profile/index.js';
import { registerJobCommands } from './commands/job/index.js';
import { error } from './utils/output.js';

const program = new Command();

program
  .name('imagen')
  .description('imagen-ps CLI — lightweight automation surface')
  .version('0.1.0');

program.exitOverride();
program.configureOutput({
  // Parser-level failures are part of the automation contract, so suppress
  // Commander's human error text and emit JSON from the catch block below.
  outputError: () => {},
});

// Inject CLI file-system adapters before any command action runs.
// 用 preAction hook 而非模块顶层注入，确保命令执行前按当前环境注入 adapter。
program.hook('preAction', () => {
  const configDir = process.env.IMAGEN_CONFIG_DIR ?? undefined;
  setProviderProfileRepository(new FileProviderProfileRepository(configDir));
  setSecretStorageAdapter(new FileSecretStorageAdapter(configDir));
});

registerProviderCommands(program);
registerProfileCommands(program);
registerJobCommands(program);

try {
  program.parse(process.argv);
} catch (err: unknown) {
  if (
    err instanceof Error &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string' &&
    (err as { code: string }).code.startsWith('commander.')
  ) {
    const commanderError = err as Error & { exitCode?: number; code: string };
    if (commanderError.exitCode === 0) {
      process.exit(0);
    }
    error(commanderError.message.replace(/^error:\s*/i, ''));
  }
  throw err;
}

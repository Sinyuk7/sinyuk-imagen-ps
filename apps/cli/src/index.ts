#!/usr/bin/env node

import { Command } from 'commander';
import {
  setAssetStore,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  configureRuntimeLogging,
} from '@imagen-ps/application';
import { getRuntimeLogger } from '@imagen-ps/application';
import { createFileLogSink } from './adapters/file-log-sink.js';
import { FileAssetStore, FileJobHistoryStore } from './adapters/file-job-history-adapter.js';
import { FileProviderProfileRepository, FileSecretStorageAdapter } from './adapters/file-provider-profile-adapter.js';
import { registerProviderCommands } from './commands/provider/index.js';
import { registerProfileCommands } from './commands/profile/index.js';
import { registerJobCommands } from './commands/job/index.js';
import { registerTaskCommands } from './commands/task/index.js';
import { registerInitCommand } from './commands/init/index.js';
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

// 配置 CLI 日志：文件 sink，不写 stdout/stderr。
// 在命令解析前就初始化，确保 parser 失败也能被记录。
// IMAGEN_CONFIG_DIR 只控制 CLI state；日志只由 IMAGEN_LOG_DIR 覆盖。
const cliLogDir = process.env.IMAGEN_LOG_DIR;
configureRuntimeLogging(createFileLogSink({ logDir: cliLogDir }), 'cli');

// Inject CLI file-system adapters before any command action runs.
// 用 preAction hook 而非模块顶层注入，确保命令执行前按当前环境注入 adapter。
program.hook('preAction', () => {
  const configDir = process.env.IMAGEN_CONFIG_DIR ?? undefined;
  setProviderProfileRepository(new FileProviderProfileRepository(configDir));
  setSecretStorageAdapter(new FileSecretStorageAdapter(configDir));
  setJobHistoryStore(new FileJobHistoryStore(configDir));
  setAssetStore(new FileAssetStore(configDir));
});

registerProviderCommands(program);
registerProfileCommands(program);
registerJobCommands(program);
registerTaskCommands(program);
registerInitCommand(program);

try {
  program.parse(process.argv);
} catch (err: unknown) {
  const logger = getRuntimeLogger();
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
    logger.error('cli.command.parser_fail', { code: commanderError.code, message: commanderError.message });
    error(commanderError.message.replace(/^error:\s*/i, ''));
  }
  logger.error('cli.command.uncaught', { message: err instanceof Error ? err.message : String(err) });
  throw err;
}

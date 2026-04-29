#!/usr/bin/env node

import { Command } from 'commander';
import { setConfigAdapter, setProviderProfileRepository, setSecretStorageAdapter } from '@imagen-ps/shared-commands';
import { FileConfigAdapter } from './adapters/file-config-adapter.js';
import { FileProviderProfileRepository, FileSecretStorageAdapter } from './adapters/file-provider-profile-adapter.js';
import { registerProviderCommands } from './commands/provider/index.js';
import { registerProfileCommands } from './commands/profile/index.js';
import { registerJobCommands } from './commands/job/index.js';

// Inject CLI file-system adapters before any command runs.
const configAdapter = new FileConfigAdapter();
setConfigAdapter(configAdapter);
setProviderProfileRepository(new FileProviderProfileRepository());
setSecretStorageAdapter(new FileSecretStorageAdapter());

const program = new Command();

program.name('imagen').description('imagen-ps CLI — lightweight automation surface').version('0.1.0');

registerProviderCommands(program);
registerProfileCommands(program);
registerJobCommands(program);

program.parse(process.argv);

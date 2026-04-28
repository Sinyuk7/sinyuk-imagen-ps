#!/usr/bin/env node

import { Command } from 'commander';
import { setConfigAdapter } from '@imagen-ps/shared-commands';
import { FileConfigAdapter } from './adapters/file-config-adapter.js';
import { registerProviderCommands } from './commands/provider/index.js';
import { registerJobCommands } from './commands/job/index.js';

// Inject file-system config adapter before any command runs
const adapter = new FileConfigAdapter();
setConfigAdapter(adapter);

const program = new Command();

program.name('imagen').description('imagen-ps CLI — lightweight automation surface').version('0.1.0');

registerProviderCommands(program);
registerJobCommands(program);

program.parse(process.argv);

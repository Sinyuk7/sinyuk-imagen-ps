import type { Command } from 'commander';
import { registerProfileLifecycleCommands } from './lifecycle.js';
import { registerProfileModelsCommand } from './models.js';
import { registerProfileRefreshModelsCommand } from './refresh-models.js';
import { registerProfileSetDefaultModelCommand } from './set-default-model.js';
import { registerProfileEnableCommand } from './enable.js';
import { registerProfileDisableCommand } from './disable.js';

/**
 * 注册扁平化的 `imagen profile` 顶级命令组。
 *
 * INTENT: 在 `imagen profile` 命名空间下统一暴露 profile lifecycle + model discovery + enable/disable 能力。
 * INPUT: Commander 顶级 program 对象。
 * OUTPUT: 无返回值；副作用为向 program 上注册子命令。
 * SIDE EFFECT: 注册以下命令——list / get / save / delete / test / models / refresh-models / set-default-model / enable / disable。
 * FAILURE: 子命令在执行期失败时各自写 stderr 并以 code 1 退出。
 */
export function registerProfileCommands(program: Command): void {
  const profile = program
    .command('profile')
    .description('Manage provider profiles (CLI store is separate from Photoshop UXP by default)');

  registerProfileLifecycleCommands(profile);
  registerProfileModelsCommand(profile);
  registerProfileRefreshModelsCommand(profile);
  registerProfileSetDefaultModelCommand(profile);
  registerProfileEnableCommand(profile);
  registerProfileDisableCommand(profile);
}

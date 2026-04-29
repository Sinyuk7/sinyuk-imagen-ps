import type { Command } from 'commander';
import { listProfileModels } from '@imagen-ps/shared-commands';
import { error, success } from '../../utils/output.js';

function failUnknown(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  error(msg);
}

/**
 * 注册 `imagen profile models <profileId>` 子命令。
 *
 * INTENT: 暴露 `listProfileModels` 的 fallback chain（cache → impl default → empty）查询能力。
 * INPUT: Commander 的 `imagen profile` 顶级命令对象。
 * OUTPUT: stdout JSON `{ models: [...] }`；profile 不存在或 provider 未注册写 stderr 并退出 1。
 * SIDE EFFECT: 经由已注入的 CLI profile repository 读取 profile。
 * FAILURE: command result 失败或运行期异常均写 stderr 并以 code 1 退出。
 */
export function registerProfileModelsCommand(profile: Command): void {
  profile
    .command('models <profileId>')
    .description('List effective candidate models for a profile (cache → impl default → empty)')
    .action(async (profileId: string) => {
      try {
        const result = await listProfileModels(profileId);
        if (!result.ok) error(result.error.message);
        success({ models: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });
}

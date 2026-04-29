import type { Command } from 'commander';
import { refreshProfileModels } from '@imagen-ps/shared-commands';
import { error, success } from '../../utils/output.js';

function failUnknown(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  error(msg);
}

/**
 * 注册 `imagen profile refresh-models <profileId>` 子命令。
 *
 * INTENT: 触发 provider 的 `discoverModels(config)` 并将结果覆盖写回 profile.models cache。
 * INPUT: Commander 的 `imagen profile` 顶级命令对象。
 * OUTPUT: stdout JSON `{ models: [...] }`（成功）；validation/provider 错误写 stderr 并退出 1。
 * SIDE EFFECT: 在成功路径上覆盖 profile.models 并经由 repository 持久化；失败路径不修改 profile。
 * FAILURE: provider 未实现 discoverModels、profile 不存在、provider 调用抛错均退出 1。
 */
export function registerProfileRefreshModelsCommand(profile: Command): void {
  profile
    .command('refresh-models <profileId>')
    .description('Invoke provider.discoverModels and persist the result into profile.models cache')
    .action(async (profileId: string) => {
      try {
        const result = await refreshProfileModels(profileId);
        if (!result.ok) error(result.error.message);
        success({ models: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });
}

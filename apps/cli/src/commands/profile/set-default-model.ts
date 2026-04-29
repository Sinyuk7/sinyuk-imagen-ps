import type { Command } from 'commander';
import { setProfileDefaultModel } from '@imagen-ps/shared-commands';
import { error, success } from '../../utils/output.js';

function failUnknown(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  error(msg);
}

/**
 * 注册 `imagen profile set-default-model <profileId> <modelId>` 子命令。
 *
 * INTENT: 严格地将 profile.config.defaultModel 设为 candidate list 中的 modelId（不提供 force 旁路）。
 * INPUT: Commander 的 `imagen profile` 顶级命令对象。
 * OUTPUT: stdout JSON `{ profile: ... }`（成功）；不在 candidate 中或空列表场景写 stderr 并退出 1。
 * SIDE EFFECT: 经由 repository 持久化 profile（保留其他字段及 models cache）。
 * FAILURE: profile 不存在、modelId 不在 candidate list 中均返回 validation error 并退出 1。
 */
export function registerProfileSetDefaultModelCommand(profile: Command): void {
  profile
    .command('set-default-model <profileId> <modelId>')
    .description('Set default model on profile.config.defaultModel; modelId MUST be in the candidate list')
    .action(async (profileId: string, modelId: string) => {
      try {
        const result = await setProfileDefaultModel(profileId, modelId);
        if (!result.ok) error(result.error.message);
        success({ profile: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });
}

import type { Command } from 'commander';
import { setProfileEnabled } from '@imagen-ps/shared-commands';
import { error, success } from '../../utils/output.js';

function failUnknown(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  error(msg);
}

/**
 * 注册 `imagen profile disable <profileId>` 子命令。
 *
 * INTENT: 将 profile.enabled 置为 false（幂等）。
 * INPUT: Commander 的 `imagen profile` 顶级命令对象。
 * OUTPUT: stdout JSON `{ profile: ... }`；profile 不存在写 stderr 并退出 1。
 * SIDE EFFECT: 经由 repository 持久化 profile，保留其他字段。
 * FAILURE: profile 不存在返回 validation error 并退出 1。
 */
export function registerProfileDisableCommand(profile: Command): void {
  profile
    .command('disable <profileId>')
    .description('Set profile.enabled = false (idempotent)')
    .action(async (profileId: string) => {
      try {
        const result = await setProfileEnabled(profileId, false);
        if (!result.ok) error(result.error.message);
        success({ profile: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });
}

import type { Command } from 'commander';
import {
  deleteProviderProfile,
  getProviderProfile,
  listProviderProfiles,
  saveProviderProfile,
  testProviderProfile,
} from '@imagen-ps/application';
import { parseJsonInput } from '../../utils/input.js';
import { error, success } from '../../utils/output.js';

function failUnknown(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  error(msg);
}

/**
 * 注册 profile lifecycle 子命令（list / get / save / delete / test）。
 *
 * INTENT: 在扁平化的 `imagen profile` 命名空间下暴露 profile 增删改查能力。
 * INPUT: Commander 的 `imagen profile` 顶级命令对象。
 * OUTPUT: 无返回值；命令执行结果以 JSON 输出到 stdout，错误以 stderr 输出并退出 1。
 * SIDE EFFECT: 通过 application 调用已注入的 CLI repository / secret adapter。
 * FAILURE: command result 失败或输入 JSON 非法时写 stderr 并以 code 1 退出。
 */
export function registerProfileLifecycleCommands(profile: Command): void {
  profile
    .command('list')
    .description('List configured provider profiles')
    .action(async () => {
      try {
        const result = await listProviderProfiles();
        if (!result.ok) error(result.error.message);
        success({ profiles: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });

  profile
    .command('get <profileId>')
    .description('Get a provider profile without secret values')
    .action(async (profileId: string) => {
      try {
        const result = await getProviderProfile(profileId);
        if (!result.ok) error(result.error.message);
        success({ profile: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });

  profile
    .command('save <profileJson>')
    .description('Create or update a provider profile from JSON string or @file; secretValues are write-only')
    .action(async (profileJson: string) => {
      let parsed: unknown;
      try {
        parsed = parseJsonInput(profileJson);
      } catch (err: unknown) {
        failUnknown(err);
      }

      try {
        const result = await saveProviderProfile(parsed as Parameters<typeof saveProviderProfile>[0]);
        if (!result.ok) error(result.error.message);
        success({ profile: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });

  profile
    .command('delete <profileId>')
    .description('Delete a provider profile; associated secrets are deleted by default')
    .option('--retain-secrets', 'delete profile but retain referenced secrets')
    .action(async (profileId: string, options: { retainSecrets?: boolean }) => {
      try {
        const result = await deleteProviderProfile(profileId, { retainSecrets: options.retainSecrets === true });
        if (!result.ok) error(result.error.message);
        success({ ok: true });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });

  profile
    .command('test <profileId>')
    .description('Test a provider profile (config validation by default)')
    .option('--connect', 'Test API connectivity by discovering models (no cost)')
    .option('--generate', 'Run a minimal text-to-image smoke test (costs money, requires --connect)')
    .action(async (profileId: string, options: { connect?: boolean; generate?: boolean }) => {
      try {
        const result = await testProviderProfile(profileId, {
          connect: options.connect === true,
          generate: options.generate === true,
        });
        if (!result.ok) error(result.error.message);
        success({ result: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });
}

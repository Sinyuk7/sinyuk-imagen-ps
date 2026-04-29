import type { Command } from 'commander';
import {
  deleteProviderProfile,
  getProviderProfile,
  listProviderProfiles,
  saveProviderProfile,
  testProviderProfile,
} from '@imagen-ps/shared-commands';
import { parseJsonInput } from '../../utils/input.js';
import { error, success } from '../../utils/output.js';

function failUnknown(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  error(msg);
}

/**
 * 注册 provider profile CLI commands。
 *
 * INTENT: 暴露 profile lifecycle 的 list/get/save/delete/test 能力。
 * INPUT: Commander provider command group。
 * OUTPUT: 无返回值；命令执行结果以 JSON 输出。
 * SIDE EFFECT: 通过 shared-commands 调用已注入的 CLI repository / secret adapter。
 * FAILURE: command result 失败或输入 JSON 非法时写 stderr 并以 code 1 退出。
 */
export function registerProviderProfileCommands(provider: Command): void {
  const profile = provider
    .command('profile')
    .description('Manage provider profiles (CLI store is separate from Photoshop UXP by default)');

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
    .description('Save a provider profile from JSON string or @file; secretValues are write-only')
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
    .description('Validate a provider profile without returning resolved secret-bearing config')
    .action(async (profileId: string) => {
      try {
        const result = await testProviderProfile(profileId);
        if (!result.ok) error(result.error.message);
        success({ result: result.value });
      } catch (err: unknown) {
        failUnknown(err);
      }
    });
}

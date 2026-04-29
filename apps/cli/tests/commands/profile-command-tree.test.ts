import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerProfileCommands } from '../../src/commands/profile/index.js';
import { registerProviderCommands } from '../../src/commands/provider/index.js';
import { registerJobCommands } from '../../src/commands/job/index.js';

/**
 * 命令树快照：确认顶级命名空间包含 `profile` 而**不**包含 `provider profile`。
 *
 * INTENT: Section 9.1 — 防止意外双路径回归（`imagen profile *` vs `imagen provider profile *`）。
 * INPUT: 干净的 Commander program。
 * OUTPUT: 一组对命令树形状的硬断言。
 * SIDE EFFECT: 仅注册命令；不触发任何 action（不会 exit）。
 * FAILURE: 任一断言失败即视为路径扁平化回归。
 */
describe('CLI command tree (post-flatten)', () => {
  function buildProgram(): Command {
    const program = new Command();
    program.name('imagen');
    registerProviderCommands(program);
    registerProfileCommands(program);
    registerJobCommands(program);
    return program;
  }

  function names(cmds: ReadonlyArray<Command>): string[] {
    return cmds.map((c) => c.name());
  }

  it('top-level commands include `profile` and `provider`', () => {
    const program = buildProgram();
    const top = names(program.commands);
    expect(top).toContain('profile');
    expect(top).toContain('provider');
    expect(top).toContain('job');
  });

  it('`provider` no longer hosts a `profile` sub-command', () => {
    const program = buildProgram();
    const provider = program.commands.find((c) => c.name() === 'provider');
    expect(provider).toBeDefined();
    const providerSubs = names(provider!.commands);
    expect(providerSubs).not.toContain('profile');
    // sanity: provider still hosts list/describe/config
    expect(providerSubs).toEqual(expect.arrayContaining(['list', 'describe', 'config']));
  });

  it('`imagen profile` exposes lifecycle + discovery + enable/disable subcommands', () => {
    const program = buildProgram();
    const profile = program.commands.find((c) => c.name() === 'profile');
    expect(profile).toBeDefined();
    const subs = names(profile!.commands);
    expect(subs).toEqual(
      expect.arrayContaining([
        // lifecycle (migrated from `provider profile`)
        'list',
        'get',
        'save',
        'delete',
        'test',
        // newly added in this change
        'models',
        'refresh-models',
        'set-default-model',
        'enable',
        'disable',
      ]),
    );
  });
});

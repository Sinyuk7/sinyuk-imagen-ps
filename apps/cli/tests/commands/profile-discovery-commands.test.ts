import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

// Mock shared-commands so we can assert each new CLI command wires through to
// the corresponding facade with the expected arguments.
vi.mock('@imagen-ps/shared-commands', () => ({
  listProfileModels: vi.fn(async () => ({ ok: true, value: [{ id: 'mock-image-v1' }] })),
  refreshProfileModels: vi.fn(async () => ({ ok: true, value: [{ id: 'discovered-1' }] })),
  setProfileDefaultModel: vi.fn(async () => ({
    ok: true,
    value: { profileId: 'mock-dev', config: { defaultModel: 'mock-image-v1' } } as never,
  })),
  setProfileEnabled: vi.fn(async () => ({
    ok: true,
    value: { profileId: 'mock-dev', enabled: true } as never,
  })),
}));

// Stubbed output helpers; throw on invocation so the action handlers short-circuit
// without touching real process.exit / stdout. The thrown sentinel is a Symbol,
// which `failUnknown(err)` cannot mistake for an Error.
const EXIT = Symbol('cli-exit');
let lastSuccess: unknown = undefined;
let lastError: string | undefined = undefined;

vi.mock('../../src/utils/output.js', () => ({
  // First call wins; subsequent calls (e.g. via failUnknown re-throw) are ignored
  // so the original success/error intent is preserved across the action handler's
  // try/catch wrapper.
  success: (data: unknown) => {
    if (lastSuccess === undefined && lastError === undefined) {
      lastSuccess = data;
    }
    throw EXIT;
  },
  error: (msg: string) => {
    if (lastError === undefined && lastSuccess === undefined) {
      lastError = msg;
    }
    throw EXIT;
  },
}));

import {
  listProfileModels,
  refreshProfileModels,
  setProfileDefaultModel,
  setProfileEnabled,
} from '@imagen-ps/shared-commands';
import { registerProfileCommands } from '../../src/commands/profile/index.js';

/**
 * 在 Commander 上下文中执行一条 `imagen profile <args...>`，返回 success 数据或错误字符串。
 *
 * INTENT: 验证 5 个新 CLI 命令正确地把 argv 转发到对应的 shared-commands 函数，
 * 并把 result 的 ok / error 分支正确地分流到 success / error 输出助手。
 * INPUT: argv tail，例如 `['profile', 'models', 'mock-dev']`。
 * OUTPUT: `{ kind: 'success'; data }` 或 `{ kind: 'error'; message }`。
 * SIDE EFFECT: 通过 mock 捕获最近一次 success/error 调用；不会触发 process.exit。
 */
async function runProfileCommand(
  args: string[],
): Promise<{ kind: 'success'; data: unknown } | { kind: 'error'; message: string }> {
  lastSuccess = undefined;
  lastError = undefined;

  const program = new Command();
  program.name('imagen');
  registerProfileCommands(program);

  try {
    await program.parseAsync(['node', 'imagen', ...args]);
  } catch (err: unknown) {
    if (err !== EXIT) throw err;
  }

  if (lastError !== undefined) return { kind: 'error', message: lastError };
  return { kind: 'success', data: lastSuccess };
}

describe('imagen profile models', () => {
  it('happy path: forwards profileId and emits { models } payload', async () => {
    vi.mocked(listProfileModels).mockResolvedValueOnce({
      ok: true,
      value: [{ id: 'mock-image-v1' }],
    });

    const result = await runProfileCommand(['profile', 'models', 'mock-dev']);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.data).toEqual({ models: [{ id: 'mock-image-v1' }] });
    }
    expect(listProfileModels).toHaveBeenCalledWith('mock-dev');
  });

  it('failure path: surfaces validation error message', async () => {
    vi.mocked(listProfileModels).mockResolvedValueOnce({
      ok: false,
      error: { category: 'validation', message: 'profile not found: missing' },
    });

    const result = await runProfileCommand(['profile', 'models', 'missing']);
    expect(result).toEqual({ kind: 'error', message: 'profile not found: missing' });
  });
});

describe('imagen profile refresh-models', () => {
  it('happy path: forwards profileId and emits refreshed { models } payload', async () => {
    vi.mocked(refreshProfileModels).mockResolvedValueOnce({
      ok: true,
      value: [{ id: 'discovered-1' }, { id: 'discovered-2' }],
    });

    const result = await runProfileCommand(['profile', 'refresh-models', 'mock-dev']);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.data).toEqual({
        models: [{ id: 'discovered-1' }, { id: 'discovered-2' }],
      });
    }
    expect(refreshProfileModels).toHaveBeenCalledWith('mock-dev');
  });

  it('failure path: provider missing discoverModels surfaces validation error', async () => {
    vi.mocked(refreshProfileModels).mockResolvedValueOnce({
      ok: false,
      error: {
        category: 'validation',
        message: 'provider mock does not implement discoverModels',
      },
    });

    const result = await runProfileCommand(['profile', 'refresh-models', 'mock-dev']);
    expect(result).toEqual({
      kind: 'error',
      message: 'provider mock does not implement discoverModels',
    });
  });
});

describe('imagen profile set-default-model', () => {
  it('happy path: forwards (profileId, modelId) and emits { profile } payload', async () => {
    vi.mocked(setProfileDefaultModel).mockResolvedValueOnce({
      ok: true,
      value: {
        profileId: 'mock-dev',
        providerId: 'mock',
        family: 'openai-compatible',
        displayName: 'Mock Dev',
        enabled: true,
        config: { defaultModel: 'mock-image-v1' },
        secretRefs: {},
        createdAt: '2026-04-29T00:00:00.000Z',
        updatedAt: '2026-04-29T00:00:00.000Z',
      } as never,
    });

    const result = await runProfileCommand(['profile', 'set-default-model', 'mock-dev', 'mock-image-v1']);
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      const data = result.data as { profile: { config: { defaultModel: string } } };
      expect(data.profile.config.defaultModel).toBe('mock-image-v1');
    }
    expect(setProfileDefaultModel).toHaveBeenCalledWith('mock-dev', 'mock-image-v1');
  });

  it('failure path: unknown modelId surfaces validation error', async () => {
    vi.mocked(setProfileDefaultModel).mockResolvedValueOnce({
      ok: false,
      error: {
        category: 'validation',
        message: 'modelId "unknown" is not in the candidate list',
      },
    });

    const result = await runProfileCommand(['profile', 'set-default-model', 'mock-dev', 'unknown']);
    expect(result).toEqual({
      kind: 'error',
      message: 'modelId "unknown" is not in the candidate list',
    });
  });
});

describe('imagen profile enable', () => {
  it('happy path: invokes setProfileEnabled(id, true)', async () => {
    vi.mocked(setProfileEnabled).mockResolvedValueOnce({
      ok: true,
      value: { profileId: 'mock-dev', enabled: true } as never,
    });

    const result = await runProfileCommand(['profile', 'enable', 'mock-dev']);
    expect(result.kind).toBe('success');
    expect(setProfileEnabled).toHaveBeenCalledWith('mock-dev', true);
  });

  it('failure path: profile not found surfaces validation error', async () => {
    vi.mocked(setProfileEnabled).mockResolvedValueOnce({
      ok: false,
      error: { category: 'validation', message: 'profile not found: missing' },
    });

    const result = await runProfileCommand(['profile', 'enable', 'missing']);
    expect(result).toEqual({ kind: 'error', message: 'profile not found: missing' });
  });
});

describe('imagen profile disable', () => {
  it('happy path: invokes setProfileEnabled(id, false)', async () => {
    vi.mocked(setProfileEnabled).mockResolvedValueOnce({
      ok: true,
      value: { profileId: 'mock-dev', enabled: false } as never,
    });

    const result = await runProfileCommand(['profile', 'disable', 'mock-dev']);
    expect(result.kind).toBe('success');
    expect(setProfileEnabled).toHaveBeenCalledWith('mock-dev', false);
  });

  it('failure path: profile not found surfaces validation error', async () => {
    vi.mocked(setProfileEnabled).mockResolvedValueOnce({
      ok: false,
      error: { category: 'validation', message: 'profile not found: missing' },
    });

    const result = await runProfileCommand(['profile', 'disable', 'missing']);
    expect(result).toEqual({ kind: 'error', message: 'profile not found: missing' });
  });
});

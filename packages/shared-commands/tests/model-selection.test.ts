/**
 * Model selection 三级优先级矩阵测试
 *
 * 验证 model selection 完整链路：
 * - profile A defaultModel → dispatch 使用 A 的 defaultModel
 * - profile B defaultModel → dispatch 使用 B 的 defaultModel
 * - job input explicit model → override profile defaultModel
 * - 无 defaultModel + 无 explicit model → provider fallback default (mock-image-v1)
 * - profile 更新后立即生效
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { submitJob, saveProviderProfile } from '../src/commands/index.js';
import { _resetForTesting } from '../src/runtime.js';

/** 提取 invoke result 的 raw.model */
function extractModel(jobOutput: Record<string, unknown> | undefined): string | undefined {
  const image = jobOutput?.image as Record<string, unknown> | undefined;
  const raw = image?.raw as Record<string, unknown> | undefined;
  return raw?.model as string | undefined;
}

const now = new Date().toISOString();

function makeProfileInput(overrides: { profileId: string; defaultModel?: string }) {
  return {
    profileId: overrides.profileId,
    providerId: 'mock',
    family: 'openai-compatible' as const,
    displayName: `Profile ${overrides.profileId}`,
    config: {
      baseURL: 'https://mock.local',
      ...(overrides.defaultModel !== undefined ? { defaultModel: overrides.defaultModel } : {}),
    },
    secretValues: {
      apiKey: `secret-for-${overrides.profileId}`,
    },
  };
}

describe('model selection three-tier priority', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('profile A defaultModel is used when no explicit model in job input', async () => {
    await saveProviderProfile(makeProfileInput({ profileId: 'profile-a', defaultModel: 'mock-a' }));

    const result = await submitJob({
      workflow: 'provider-generate',
      input: { provider: 'profile', providerProfileId: 'profile-a', prompt: 'test' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
      expect(extractModel(result.value.output)).toBe('mock-a');
    }
  });

  it('profile B defaultModel is used independently of profile A', async () => {
    await saveProviderProfile(makeProfileInput({ profileId: 'profile-a', defaultModel: 'mock-a' }));
    await saveProviderProfile(makeProfileInput({ profileId: 'profile-b', defaultModel: 'mock-b' }));

    const resultA = await submitJob({
      workflow: 'provider-generate',
      input: { provider: 'profile', providerProfileId: 'profile-a', prompt: 'test a' },
    });
    const resultB = await submitJob({
      workflow: 'provider-generate',
      input: { provider: 'profile', providerProfileId: 'profile-b', prompt: 'test b' },
    });

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    if (resultA.ok && resultB.ok) {
      expect(extractModel(resultA.value.output)).toBe('mock-a');
      expect(extractModel(resultB.value.output)).toBe('mock-b');
    }
  });

  it('job input explicit providerOptions.model overrides profile defaultModel', async () => {
    await saveProviderProfile(makeProfileInput({ profileId: 'profile-a', defaultModel: 'mock-a' }));

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'profile',
        providerProfileId: 'profile-a',
        prompt: 'test override',
        providerOptions: { model: 'override-model' },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
      expect(extractModel(result.value.output)).toBe('override-model');
    }
  });

  it('falls back to provider hardcoded default when no defaultModel and no explicit model', async () => {
    // Profile without defaultModel
    await saveProviderProfile(makeProfileInput({ profileId: 'profile-no-model' }));

    const result = await submitJob({
      workflow: 'provider-generate',
      input: { provider: 'profile', providerProfileId: 'profile-no-model', prompt: 'test fallback' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
      expect(extractModel(result.value.output)).toBe('mock-image-v1');
    }
  });

  it('profile update takes effect on next dispatch immediately', async () => {
    await saveProviderProfile(makeProfileInput({ profileId: 'profile-a', defaultModel: 'mock-a' }));

    // First dispatch — uses mock-a
    const result1 = await submitJob({
      workflow: 'provider-generate',
      input: { provider: 'profile', providerProfileId: 'profile-a', prompt: 'before update' },
    });
    expect(result1.ok).toBe(true);
    if (result1.ok) {
      expect(extractModel(result1.value.output)).toBe('mock-a');
    }

    // Update profile A defaultModel
    await saveProviderProfile(makeProfileInput({ profileId: 'profile-a', defaultModel: 'mock-a-v2' }));

    // Second dispatch — uses mock-a-v2 immediately
    const result2 = await submitJob({
      workflow: 'provider-generate',
      input: { provider: 'profile', providerProfileId: 'profile-a', prompt: 'after update' },
    });
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(extractModel(result2.value.output)).toBe('mock-a-v2');
    }
  });
});

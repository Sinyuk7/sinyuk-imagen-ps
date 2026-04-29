/**
 * setProfileDefaultModel 测试。
 *
 * 覆盖：命中 cache、命中 impl default、未命中、空列表全拒绝、profile 不存在、
 * 不存在 force 旁路。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  setProfileDefaultModel,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  type ProviderProfile,
  type ProviderProfileRepository,
} from '../src/commands/index.js';
import { _resetForTesting } from '../src/runtime.js';

const baseProfile: ProviderProfile = {
  profileId: 'mock-set-default',
  providerId: 'mock',
  family: 'openai-compatible',
  displayName: 'Mock Set Default',
  enabled: true,
  config: { baseURL: 'https://mock.local' },
  secretRefs: { apiKey: 'secret:mock-set-default:apiKey' },
  createdAt: '2026-04-29T00:00:00.000Z',
  updatedAt: '2026-04-29T00:00:00.000Z',
};

function makeRepo(initial: ProviderProfile[]): {
  repo: ProviderProfileRepository;
  store: Map<string, ProviderProfile>;
} {
  const store = new Map(initial.map((p) => [p.profileId, p]));
  const repo: ProviderProfileRepository = {
    async list() {
      return Array.from(store.values());
    },
    async get(profileId) {
      return store.get(profileId);
    },
    async save(profile) {
      store.set(profile.profileId, profile);
    },
    async delete(profileId) {
      store.delete(profileId);
    },
  };
  return { repo, store };
}

describe('setProfileDefaultModel', () => {
  beforeEach(() => {
    _resetForTesting();
    setSecretStorageAdapter({
      async getSecret(key) {
        return key.endsWith('apiKey') ? 'mock-key' : undefined;
      },
      async setSecret() {},
      async deleteSecret() {},
    });
  });

  afterEach(() => {
    _resetForTesting();
  });

  it('sets defaultModel when modelId hits the profile.models cache', async () => {
    const profile = {
      ...baseProfile,
      models: [{ id: 'cached-a' }, { id: 'cached-b' }],
    };
    const { repo, store } = makeRepo([profile]);
    setProviderProfileRepository(repo);

    const result = await setProfileDefaultModel(profile.profileId, 'cached-b');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.defaultModel).toBe('cached-b');
    }
    expect(store.get(profile.profileId)?.config.defaultModel).toBe('cached-b');
    // models cache MUST be preserved
    expect(store.get(profile.profileId)?.models).toEqual([{ id: 'cached-a' }, { id: 'cached-b' }]);
  });

  it('sets defaultModel when modelId hits descriptor.defaultModels (impl-default fallback)', async () => {
    // No profile.models -> falls back to mock descriptor.defaultModels = [{ id: 'mock-image-v1' }]
    const { repo, store } = makeRepo([baseProfile]);
    setProviderProfileRepository(repo);

    const result = await setProfileDefaultModel(baseProfile.profileId, 'mock-image-v1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.defaultModel).toBe('mock-image-v1');
    }
    expect(store.get(baseProfile.profileId)?.config.defaultModel).toBe('mock-image-v1');
  });

  it('rejects modelId not in candidate list and does not modify profile', async () => {
    const profile = { ...baseProfile, models: [{ id: 'cached-a' }] };
    const { repo, store } = makeRepo([profile]);
    setProviderProfileRepository(repo);

    const before = JSON.stringify(store.get(profile.profileId));
    const result = await setProfileDefaultModel(profile.profileId, 'unknown-model');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('unknown-model');
    }
    // profile MUST NOT be modified
    expect(JSON.stringify(store.get(profile.profileId))).toBe(before);
  });

  it('rejects every modelId when candidate list is empty (openai-compatible has no defaults)', async () => {
    // openai-compatible currently has no descriptor.defaultModels and no profile.models cache.
    const profile: ProviderProfile = {
      ...baseProfile,
      profileId: 'oai-empty',
      providerId: 'openai-compatible',
    };
    const { repo, store } = makeRepo([profile]);
    setProviderProfileRepository(repo);

    const before = JSON.stringify(store.get(profile.profileId));
    const result = await setProfileDefaultModel(profile.profileId, 'anything');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('no candidate models');
    }
    expect(JSON.stringify(store.get(profile.profileId))).toBe(before);
  });

  it('returns validation error when profile does not exist', async () => {
    const { repo } = makeRepo([]);
    setProviderProfileRepository(repo);

    const result = await setProfileDefaultModel('does-not-exist', 'mock-image-v1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('does-not-exist');
    }
  });

  it('does NOT expose any force / override bypass parameter', async () => {
    // 编译期/运行时双断言：函数签名只接受 (profileId, modelId)，无第三参数。
    expect(setProfileDefaultModel.length).toBe(2);
  });
});

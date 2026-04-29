/**
 * refreshProfileModels 测试。
 *
 * 覆盖：
 * - mock implementation 无 `discoverModels` → validation error，profile.models 不变。
 * - 自定义带 `discoverModels` 的伪 implementation → 成功覆盖。
 * - 伪 implementation 抛错 → provider error，profile.models 不变。
 * - 返回空数组 → profile.models 被设为 []。
 *
 * NOTE: 通过 mutate 已注册 mock provider 实例的 `discoverModels` 字段实现"伪
 * implementation"；mock provider 在 `createMockProvider()` 返回的对象未被
 * frozen，运行时 mutation 在测试隔离下安全（每个 _resetForTesting 后会重建
 * runtime + registry + 新 mock 实例）。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  refreshProfileModels,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  type ProviderProfile,
  type ProviderProfileRepository,
} from '../src/commands/index.js';
import { _resetForTesting, getRuntime } from '../src/runtime.js';

const baseProfile: ProviderProfile = {
  profileId: 'mock-refresh',
  providerId: 'mock',
  family: 'openai-compatible',
  displayName: 'Mock Refresh',
  enabled: true,
  config: { baseURL: 'https://mock.local' },
  secretRefs: { apiKey: 'secret:mock-refresh:apiKey' },
  models: [{ id: 'preexisting-cached-model' }],
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

function setupSecrets(): void {
  setSecretStorageAdapter({
    async getSecret(key) {
      return key.endsWith('apiKey') ? 'mock-key' : undefined;
    },
    async setSecret() {},
    async deleteSecret() {},
  });
}

describe('refreshProfileModels', () => {
  beforeEach(() => {
    _resetForTesting();
    setupSecrets();
  });

  afterEach(() => {
    _resetForTesting();
  });

  it('returns validation error when implementation does not implement discoverModels (mock)', async () => {
    const { repo, store } = makeRepo([baseProfile]);
    setProviderProfileRepository(repo);

    const result = await refreshProfileModels(baseProfile.profileId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('does not support model discovery');
    }
    // profile.models must remain unchanged
    expect(store.get(baseProfile.profileId)?.models).toEqual([{ id: 'preexisting-cached-model' }]);
  });

  it('overwrites profile.models when discoverModels resolves with a non-empty list', async () => {
    const { repo, store } = makeRepo([baseProfile]);
    setProviderProfileRepository(repo);

    const mockProvider = getRuntime().providerRegistry.get('mock')!;
    (mockProvider as unknown as { discoverModels: () => Promise<readonly { id: string }[]> }).discoverModels =
      async () => [{ id: 'discovered-1' }, { id: 'discovered-2' }];

    const result = await refreshProfileModels(baseProfile.profileId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ id: 'discovered-1' }, { id: 'discovered-2' }]);
    }
    expect(store.get(baseProfile.profileId)?.models).toEqual([{ id: 'discovered-1' }, { id: 'discovered-2' }]);
  });

  it('returns provider error when discoverModels throws and leaves profile.models unchanged', async () => {
    const { repo, store } = makeRepo([baseProfile]);
    setProviderProfileRepository(repo);

    const mockProvider = getRuntime().providerRegistry.get('mock')!;
    (mockProvider as unknown as { discoverModels: () => Promise<readonly { id: string }[]> }).discoverModels =
      async () => {
        throw new Error('upstream connect failure');
      };

    const result = await refreshProfileModels(baseProfile.profileId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('provider');
      expect(result.error.message).toContain('upstream connect failure');
      expect(result.error.message).not.toContain('mock-key');
    }
    expect(store.get(baseProfile.profileId)?.models).toEqual([{ id: 'preexisting-cached-model' }]);
  });

  it('overwrites profile.models with empty array when discoverModels returns []', async () => {
    const { repo, store } = makeRepo([baseProfile]);
    setProviderProfileRepository(repo);

    const mockProvider = getRuntime().providerRegistry.get('mock')!;
    (mockProvider as unknown as { discoverModels: () => Promise<readonly { id: string }[]> }).discoverModels =
      async () => [];

    const result = await refreshProfileModels(baseProfile.profileId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
    expect(store.get(baseProfile.profileId)?.models).toEqual([]);
  });

  it('returns validation error when profile id does not exist', async () => {
    const { repo } = makeRepo([]);
    setProviderProfileRepository(repo);

    const result = await refreshProfileModels('does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
    }
  });
});

/**
 * listProfileModels fallback chain 测试。
 *
 * 覆盖：
 * - cache hit：profile.models 非空时直接返回，不查 descriptor.defaultModels；
 * - impl-default fallback：profile.models 缺失或空时退化到 descriptor.defaultModels；
 * - empty：两者都没有时返回 []；
 * - profile 不存在 / providerId 未注册 → validation error。
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  listProfileModels,
  saveProviderProfile,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  type ProviderProfile,
  type ProviderProfileRepository,
  type SecretStorageAdapter,
} from '../src/commands/index.js';
import { _resetForTesting } from '../src/runtime.js';

const baseProfileInput = {
  profileId: 'mock-profile',
  providerId: 'mock',
  family: 'openai-compatible' as const,
  displayName: 'Mock Profile',
  config: { baseURL: 'https://mock.local' },
  secretValues: { apiKey: 'secret-key' },
};

function createInMemoryRepo(initial: readonly ProviderProfile[] = []): {
  repo: ProviderProfileRepository;
  store: Map<string, ProviderProfile>;
} {
  const store = new Map<string, ProviderProfile>(initial.map((p) => [p.profileId, p]));
  return {
    store,
    repo: {
      async list() {
        return Array.from(store.values());
      },
      async get(id) {
        return store.get(id);
      },
      async save(p) {
        store.set(p.profileId, p);
      },
      async delete(id) {
        store.delete(id);
      },
    },
  };
}

function createInMemorySecrets(): SecretStorageAdapter {
  const store = new Map<string, string>();
  return {
    async getSecret(k) {
      return store.get(k);
    },
    async setSecret(k, v) {
      store.set(k, v);
    },
    async deleteSecret(k) {
      store.delete(k);
    },
  };
}

describe('listProfileModels fallback chain', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('returns profile.models when discovery cache is non-empty (does not consult defaultModels)', async () => {
    const profile: ProviderProfile = {
      profileId: 'mock-profile',
      providerId: 'mock',
      family: 'openai-compatible',
      displayName: 'Mock Profile',
      enabled: true,
      config: { baseURL: 'https://mock.local' },
      models: [{ id: 'cached-model-1' }, { id: 'cached-model-2', displayName: 'Cached 2' }],
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
    };
    const { repo } = createInMemoryRepo([profile]);
    setProviderProfileRepository(repo);
    setSecretStorageAdapter(createInMemorySecrets());

    const result = await listProfileModels('mock-profile');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ id: 'cached-model-1' }, { id: 'cached-model-2', displayName: 'Cached 2' }]);
    }
  });

  it('falls back to descriptor.defaultModels when profile.models is undefined', async () => {
    setSecretStorageAdapter(createInMemorySecrets());
    await saveProviderProfile(baseProfileInput);

    const result = await listProfileModels('mock-profile');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // mock declares defaultModels: [{ id: 'mock-image-v1' }]
      expect(result.value).toEqual([{ id: 'mock-image-v1' }]);
    }
  });

  it('falls back to descriptor.defaultModels when profile.models is empty array', async () => {
    const profile: ProviderProfile = {
      profileId: 'mock-profile',
      providerId: 'mock',
      family: 'openai-compatible',
      displayName: 'Mock Profile',
      enabled: true,
      config: { baseURL: 'https://mock.local' },
      models: [],
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
    };
    const { repo } = createInMemoryRepo([profile]);
    setProviderProfileRepository(repo);
    setSecretStorageAdapter(createInMemorySecrets());

    const result = await listProfileModels('mock-profile');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ id: 'mock-image-v1' }]);
    }
  });

  it('returns [] when neither cache nor defaultModels has candidates', async () => {
    const profile: ProviderProfile = {
      profileId: 'no-defaults-profile',
      providerId: 'fake-no-defaults',
      family: 'openai-compatible',
      displayName: 'No Defaults Profile',
      enabled: true,
      config: { baseURL: 'https://x.local' },
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
    };
    const { repo } = createInMemoryRepo([profile]);
    setProviderProfileRepository(repo);
    setSecretStorageAdapter(createInMemorySecrets());

    const result = await listProfileModels('no-defaults-profile');
    // providerId 不在 registry 中，应当返回 validation error。
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('fake-no-defaults');
    }
  });

  it('returns validation error when profile id does not exist', async () => {
    setSecretStorageAdapter(createInMemorySecrets());
    const result = await listProfileModels('does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('does-not-exist');
    }
  });

  it('result MUST NOT carry source / fetchedAt / fetchStatus annotations', async () => {
    setSecretStorageAdapter(createInMemorySecrets());
    await saveProviderProfile(baseProfileInput);

    const result = await listProfileModels('mock-profile');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // value 必须正好是 ProviderModelInfo[]，不含状态字段
      const json = JSON.stringify(result.value);
      expect(json).not.toContain('fetchedAt');
      expect(json).not.toContain('fetchStatus');
      expect(json).not.toContain('source');
      for (const m of result.value) {
        const keys = Object.keys(m);
        for (const k of keys) {
          expect(['id', 'displayName']).toContain(k);
        }
      }
    }
  });
});

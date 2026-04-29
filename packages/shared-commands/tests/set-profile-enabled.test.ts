/**
 * setProfileEnabled 测试。
 *
 * 覆盖：true/false toggle、幂等、profile 不存在。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  setProfileEnabled,
  setProviderProfileRepository,
  type ProviderProfile,
  type ProviderProfileRepository,
} from '../src/commands/index.js';
import { _resetForTesting } from '../src/runtime.js';

const baseProfile: ProviderProfile = {
  profileId: 'mock-toggle',
  providerId: 'mock',
  family: 'openai-compatible',
  displayName: 'Mock Toggle',
  enabled: true,
  config: { baseURL: 'https://mock.local' },
  secretRefs: { apiKey: 'secret:mock-toggle:apiKey' },
  models: [{ id: 'cached-x' }],
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

describe('setProfileEnabled', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  afterEach(() => {
    _resetForTesting();
  });

  it('disables a previously enabled profile', async () => {
    const { repo, store } = makeRepo([{ ...baseProfile, enabled: true }]);
    setProviderProfileRepository(repo);

    const result = await setProfileEnabled(baseProfile.profileId, false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enabled).toBe(false);
    }
    expect(store.get(baseProfile.profileId)?.enabled).toBe(false);
    // other fields preserved
    expect(store.get(baseProfile.profileId)?.config).toEqual({ baseURL: 'https://mock.local' });
    expect(store.get(baseProfile.profileId)?.secretRefs).toEqual({ apiKey: 'secret:mock-toggle:apiKey' });
    expect(store.get(baseProfile.profileId)?.models).toEqual([{ id: 'cached-x' }]);
  });

  it('enables a previously disabled profile', async () => {
    const { repo, store } = makeRepo([{ ...baseProfile, enabled: false }]);
    setProviderProfileRepository(repo);

    const result = await setProfileEnabled(baseProfile.profileId, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enabled).toBe(true);
    }
    expect(store.get(baseProfile.profileId)?.enabled).toBe(true);
  });

  it('is idempotent when profile is already in target state (true)', async () => {
    const { repo, store } = makeRepo([{ ...baseProfile, enabled: true }]);
    setProviderProfileRepository(repo);

    const before = JSON.stringify(store.get(baseProfile.profileId));
    const result = await setProfileEnabled(baseProfile.profileId, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enabled).toBe(true);
    }
    // updatedAt MUST NOT bump on idempotent no-op
    expect(JSON.stringify(store.get(baseProfile.profileId))).toBe(before);
  });

  it('is idempotent when profile is already in target state (false)', async () => {
    const { repo, store } = makeRepo([{ ...baseProfile, enabled: false }]);
    setProviderProfileRepository(repo);

    const before = JSON.stringify(store.get(baseProfile.profileId));
    const result = await setProfileEnabled(baseProfile.profileId, false);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(store.get(baseProfile.profileId))).toBe(before);
  });

  it('returns validation error when profile does not exist', async () => {
    const { repo } = makeRepo([]);
    setProviderProfileRepository(repo);

    const result = await setProfileEnabled('does-not-exist', true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toContain('does-not-exist');
    }
  });
});

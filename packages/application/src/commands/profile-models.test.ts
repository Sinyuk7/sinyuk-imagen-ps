import { describe, expect, it } from 'vitest';
import { _resetForTesting, setProviderProfileRepository } from '../runtime.js';
import { listProfileModels } from './profile-models.js';
import type { ProviderProfile, ProviderProfileRepository } from './types.js';

function createRepository(profiles: readonly ProviderProfile[]): ProviderProfileRepository {
  const store = new Map(profiles.map((profile) => [profile.profileId, profile]));
  return {
    async list() {
      return Array.from(store.values());
    },
    async get(profileId: string) {
      return store.get(profileId);
    },
    async save(profile: ProviderProfile) {
      store.set(profile.profileId, profile);
    },
    async delete(profileId: string) {
      store.delete(profileId);
    },
  };
}

function mockProfile(overrides?: Partial<ProviderProfile>): ProviderProfile {
  return {
    profileId: 'mock-profile',
    providerId: 'mock',
    displayName: 'Mock Profile',
    enabled: true,
    config: {
      providerId: 'mock',
      displayName: 'Mock Profile',
      family: 'image-endpoint',
      baseURL: 'https://mock.local',
      defaultModel: 'mock-image-v1',
    },
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('profile model commands', () => {
  it('merges config.defaultModel into listed candidates when it is absent', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([
      mockProfile({
        config: {
          providerId: 'mock',
          displayName: 'Mock Profile',
          family: 'image-endpoint',
          baseURL: 'https://mock.local',
          defaultModel: 'gpt-image2',
        },
      }),
    ]));

    const result = await listProfileModels('mock-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.id)).toEqual(['gpt-image2', 'mock-image-v1']);
    }
  });

  it('dedupes config.defaultModel when it already exists in discovery candidates', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([
      mockProfile({
        models: [{ id: 'gpt-image2' }, { id: 'mock-image-v1' }],
        config: {
          providerId: 'mock',
          displayName: 'Mock Profile',
          family: 'image-endpoint',
          baseURL: 'https://mock.local',
          defaultModel: 'gpt-image2',
        },
      }),
    ]));

    const result = await listProfileModels('mock-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.id)).toEqual(['gpt-image2', 'mock-image-v1']);
    }
  });

  it('does not inject an empty config.defaultModel into listed candidates', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([
      mockProfile({
        config: {
          providerId: 'mock',
          displayName: 'Mock Profile',
          family: 'image-endpoint',
          baseURL: 'https://mock.local',
          defaultModel: '   ',
        },
      }),
    ]));

    const result = await listProfileModels('mock-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.id)).toEqual(['mock-image-v1']);
    }
  });
});

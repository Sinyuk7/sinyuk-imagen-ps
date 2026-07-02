import { describe, expect, it } from 'vitest';
import { _resetForTesting, _setRuntimeInstanceForTesting, setProviderProfileRepository } from '../runtime.js';
import { createProviderRegistry, type Provider, type ProviderConfig, type ProviderRequest } from '@imagen-ps/providers';
import { listProfileModels, refreshProfileModels } from './profile-models.js';
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

function repositoryEntry(repository: ProviderProfileRepository, profileId: string): Promise<ProviderProfile | undefined> {
  return repository.get(profileId);
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

function imageEndpointProfile(overrides?: Partial<ProviderProfile>): ProviderProfile {
  return {
    profileId: 'image-endpoint-profile',
    providerId: 'image-endpoint',
    displayName: 'Image Endpoint Profile',
    enabled: true,
    config: {
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint Profile',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://example.com', enabled: true }],
      },
      defaultModel: 'gpt-image-2',
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

  it('uses the local catalog as the authoritative default list for image-endpoint providers', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([imageEndpointProfile()]));

    const result = await listProfileModels('image-endpoint-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.id)).toEqual(['gpt-image-2', 'gpt-image-1', 'dall-e-3']);
      expect(result.value.every((model) => model.supportStatus === 'selectable')).toBe(true);
    }
  });

  it('marks a saved but currently undiscovered catalog model explicitly', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([
      imageEndpointProfile({
        models: [{ id: 'gpt-image-2', supportStatus: 'selectable' }],
        config: {
          providerId: 'image-endpoint',
          displayName: 'Image Endpoint Profile',
          family: 'image-endpoint',
          connection: {
            selectionMode: 'manual',
            failoverEnabled: false,
            preferredEndpointId: 'primary',
            endpoints: [{ id: 'primary', url: 'https://example.com', enabled: true }],
          },
          defaultModel: 'dall-e-3',
        },
      }),
    ]));

    const result = await listProfileModels('image-endpoint-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toMatchObject({
        id: 'dall-e-3',
        supportStatus: 'saved-undiscovered',
      });
    }
  });

  it('reconciles stale image-endpoint cache against the current catalog before returning picker models', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([
      imageEndpointProfile({
        models: [
          { id: 'gemini-2.5-flash-image', displayName: 'Gemini 2.5 Flash Image' },
          { id: 'gemini-3-pro-image', displayName: 'Gemini 3 Pro Image' },
          { id: 'gpt-image-2', displayName: 'GPT Image 2' },
          { id: 'gpt-image-1-2025-04-15', displayName: 'GPT Image 1 2025 04 15' },
          { id: 'gpt-image-1', displayName: 'GPT Image 1' },
          { id: 'gemini-3.1-flash-lite-image', displayName: 'Gemini 3.1 Flash Lite Image' },
          { id: 'gpt-image-1-mini', displayName: 'GPT Image 1 Mini' },
          { id: 'dall-e-3', displayName: 'DALL-E 3' },
          { id: 'gemini-3.1-flash-image', displayName: 'Gemini 3.1 Flash Image' },
          { id: 'gemini-3.1-flash-image-preview', displayName: 'Gemini 3.1 Flash Image Preview' },
          { id: 'gpt-image-1.5', displayName: 'GPT Image 1.5' },
          { id: 'gemini-3-pro-image-preview', displayName: 'Gemini 3 Pro Image Preview' },
        ],
      }),
    ]));

    const result = await listProfileModels('image-endpoint-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.id)).toEqual(['gpt-image-2', 'gpt-image-1', 'dall-e-3']);
      expect(result.value.every((model) => model.supportStatus === 'selectable')).toBe(true);
    }
  });

  it('persists reconciled catalog models after refresh succeeds for image-endpoint profiles', async () => {
    _resetForTesting();
    const repository = createRepository([imageEndpointProfile()]);
    setProviderProfileRepository(repository);

    const registry = createProviderRegistry();
    const refreshingProvider: Provider<ProviderConfig, ProviderRequest> = {
      id: 'image-endpoint',
      family: 'image-endpoint',
      describe() {
        return {
          id: 'image-endpoint',
          family: 'image-endpoint',
          displayName: 'Image Endpoint',
          operations: ['text_to_image', 'image_edit'],
          invokeMode: 'sync',
        };
      },
      validateConfig(input) {
        return input as ProviderConfig;
      },
      validateRequest(input) {
        return input as ProviderRequest;
      },
      async invoke() {
        throw new Error('invoke not used in this test');
      },
      async discoverModels() {
        return [
          { id: 'gemini-2.5-flash-image', displayName: 'Gemini 2.5 Flash Image' },
          { id: 'gpt-image-2', displayName: 'GPT Image 2' },
          { id: 'gpt-image-1', displayName: 'GPT Image 1' },
          { id: 'dall-e-3', displayName: 'DALL-E 3' },
          { id: 'gpt-image-1-mini', displayName: 'GPT Image 1 Mini' },
        ];
      },
      async queryBalance() {
        throw new Error('queryBalance not used in this test');
      },
    };
    registry.register(refreshingProvider);
    _setRuntimeInstanceForTesting({ providerRegistry: registry } as never);

    const result = await refreshProfileModels('image-endpoint-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.id)).toEqual(['gpt-image-2', 'gpt-image-1', 'dall-e-3']);
    }

    const persisted = await repositoryEntry(repository, 'image-endpoint-profile');
    expect(persisted?.models?.map((model) => model.id)).toEqual(['gpt-image-2', 'gpt-image-1', 'dall-e-3']);
  });
});

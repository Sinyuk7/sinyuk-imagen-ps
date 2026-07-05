import { describe, expect, it } from 'vitest';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  setModelDiscoveryCacheRepository,
  setProviderProfileRepository,
  setUserModelConfigRepository,
} from '../runtime.js';
import { createProviderRegistry, type Provider, type ProviderConfig, type ProviderRequest } from '@imagen-ps/providers';
import { listProfileModels, refreshProfileModels } from './profile-models.js';
import type {
  ModelDiscoveryCache,
  ModelDiscoveryCacheRepository,
  ProviderProfile,
  ProviderProfileRepository,
  UserModelConfig,
  UserModelConfigRepository,
} from './types.js';

const IMAGE_ENDPOINT_CATALOG_IDS = [
  'gpt-image-2',
  'gpt-image-1',
  'dall-e-3',
  'grok-imagine-image-pro',
  'grok-imagine-image',
  'doubao-seedream-5-0-260128',
  'qwen-image-2.0-2026-03-03',
] as const;

function createProfileRepository(profiles: readonly ProviderProfile[]): ProviderProfileRepository {
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

function createDiscoveryRepository(initial: readonly ModelDiscoveryCache[] = []): {
  readonly repository: ModelDiscoveryCacheRepository;
  readonly store: Map<string, ModelDiscoveryCache>;
} {
  const store = new Map(initial.map((cache) => [cache.profileId, cache]));
  return {
    store,
    repository: {
      async get(profileId) {
        return store.get(profileId);
      },
      async put(cache) {
        store.set(cache.profileId, cache);
      },
      async delete(profileId) {
        store.delete(profileId);
      },
    },
  };
}

function createUserModelConfigRepository(configs: readonly UserModelConfig[] = []): UserModelConfigRepository {
  const store = new Map(configs.map((config) => [`${config.apiFormat}:${config.modelId}`, config]));
  return {
    async list(apiFormat) {
      const values = Array.from(store.values());
      return apiFormat === undefined ? values : values.filter((config) => config.apiFormat === apiFormat);
    },
    async get(apiFormat, modelId) {
      return store.get(`${apiFormat}:${modelId}`);
    },
    async save(config) {
      store.set(`${config.apiFormat}:${config.modelId}`, config);
    },
    async delete(apiFormat, modelId) {
      store.delete(`${apiFormat}:${modelId}`);
    },
  };
}

function imageEndpointProfile(overrides?: Partial<ProviderProfile>): ProviderProfile {
  return {
    profileId: 'image-endpoint-profile',
    apiFormat: 'openai-images',
    displayName: 'Image Endpoint Profile',
    enabled: true,
    config: {
      apiFormat: 'openai-images',
      displayName: 'Image Endpoint Profile',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://example.com', enabled: true }],
      },
      defaultModel: 'gpt-image-2',
    },
    selectedModelIds: ['gpt-image-2'],
    defaultModelId: 'gpt-image-2',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

function registerImageEndpointProvider(discoverModels: Provider<ProviderConfig, ProviderRequest>['discoverModels']): void {
  const registry = createProviderRegistry();
  const provider: Provider<ProviderConfig, ProviderRequest> = {
    id: 'image-endpoint',
    family: 'image-endpoint',
    describe() {
      return {
        id: 'image-endpoint',
        family: 'image-endpoint',
        apiFormat: 'openai-images',
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
    discoverModels,
  };
  registry.register(provider);
  _setRuntimeInstanceForTesting({ providerRegistry: registry } as never);
}

describe('profile model commands', () => {
  it('lists local profile models from cache, user config, official catalog, and selection state', async () => {
    _resetForTesting();
    setProviderProfileRepository(createProfileRepository([
      imageEndpointProfile({
        selectedModelIds: ['gpt-image-2', 'custom-user-model', 'orphan-selected-model'],
        defaultModelId: 'custom-user-model',
      }),
    ]));
    setModelDiscoveryCacheRepository(createDiscoveryRepository([
      {
        profileId: 'image-endpoint-profile',
        modelIds: ['gpt-image-2', 'unknown-remote-model'],
        refreshedAt: '2026-07-05T00:00:00.000Z',
      },
    ]).repository);
    setUserModelConfigRepository(createUserModelConfigRepository([
      {
        apiFormat: 'openai-images',
        modelId: 'custom-user-model',
        requestStrategyId: 'image-endpoint-default',
        output: { aspectRatios: ['1:1'], sizes: ['1k'], outputFormats: ['png'] },
      },
    ]));

    const result = await listProfileModels('image-endpoint-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.modelId)).toEqual([
        'gpt-image-2',
        'unknown-remote-model',
        'custom-user-model',
        'gpt-image-1',
        'dall-e-3',
        'grok-imagine-image-pro',
        'grok-imagine-image',
        'doubao-seedream-5-0-260128',
        'qwen-image-2.0-2026-03-03',
      ]);
      expect(result.value.some((model) => model.modelId === 'orphan-selected-model')).toBe(false);
      expect(result.value.find((model) => model.modelId === 'gpt-image-2')).toMatchObject({
        discovered: true,
        configured: true,
        selected: true,
        default: false,
        configSource: 'catalog',
      });
      expect(result.value.find((model) => model.modelId === 'unknown-remote-model')).toMatchObject({
        discovered: true,
        configured: false,
        selected: false,
        default: false,
      });
      expect(result.value.find((model) => model.modelId === 'custom-user-model')).toMatchObject({
        discovered: false,
        configured: true,
        selected: true,
        default: true,
        configSource: 'user',
      });
    }
  });

  it('returns the official catalog immediately when no discovery cache exists', async () => {
    _resetForTesting();
    setProviderProfileRepository(createProfileRepository([imageEndpointProfile()]));

    const result = await listProfileModels('image-endpoint-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.modelId)).toEqual(IMAGE_ENDPOINT_CATALOG_IDS);
      expect(result.value[0]).toMatchObject({
        modelId: 'gpt-image-2',
        discovered: false,
        configured: true,
        selected: true,
        default: true,
        configSource: 'catalog',
      });
    }
  });

  it('refreshes remote discovery into the discovery cache without mutating the profile', async () => {
    _resetForTesting();
    const profile = imageEndpointProfile();
    setProviderProfileRepository(createProfileRepository([profile]));
    const { repository, store } = createDiscoveryRepository();
    setModelDiscoveryCacheRepository(repository);
    registerImageEndpointProvider(async () => [
      { id: 'gpt-image-2' },
      { id: 'custom-remote-model' },
      { id: 'custom-remote-model' },
      { id: '   ' },
    ]);

    const result = await refreshProfileModels('image-endpoint-profile');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ id: 'gpt-image-2' }, { id: 'custom-remote-model' }]);
    }
    expect(store.get('image-endpoint-profile')?.modelIds).toEqual(['gpt-image-2', 'custom-remote-model']);
    expect(profile.selectedModelIds).toEqual(['gpt-image-2']);
    expect(profile.defaultModelId).toBe('gpt-image-2');
  });

  it('keeps the last successful discovery cache when refresh fails', async () => {
    _resetForTesting();
    setProviderProfileRepository(createProfileRepository([imageEndpointProfile()]));
    const { repository, store } = createDiscoveryRepository([
      {
        profileId: 'image-endpoint-profile',
        modelIds: ['cached-model'],
        refreshedAt: '2026-07-04T00:00:00.000Z',
      },
    ]);
    setModelDiscoveryCacheRepository(repository);
    registerImageEndpointProvider(async () => {
      throw new Error('upstream unavailable');
    });

    const result = await refreshProfileModels('image-endpoint-profile');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('provider');
      expect(result.error.message).toContain('upstream unavailable');
    }
    expect(store.get('image-endpoint-profile')?.modelIds).toEqual(['cached-model']);
  });
});

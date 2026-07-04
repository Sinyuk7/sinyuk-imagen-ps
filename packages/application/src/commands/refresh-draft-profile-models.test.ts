import { describe, expect, it } from 'vitest';
import { _resetForTesting, _setRuntimeInstanceForTesting, setProviderProfileRepository } from '../runtime.js';
import { createProviderRegistry, type Provider, type ProviderConfig, type ProviderRequest } from '@imagen-ps/providers';
import type { ProviderProfile, ProviderProfileRepository } from './types.js';
import { refreshDraftProfileModels } from './refresh-draft-profile-models.js';

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

function getProfile(repository: ProviderProfileRepository, profileId: string): Promise<ProviderProfile | undefined> {
  return repository.get(profileId);
}

describe('refreshDraftProfileModels', () => {
  it('discovers draft models without persisting profile model cache', async () => {
    _resetForTesting();
    const existing: ProviderProfile = {
      profileId: 'profile-a',
      apiFormat: 'openai-images',
      displayName: 'Profile A',
      enabled: true,
      config: {
        apiFormat: 'openai-images',
        displayName: 'Profile A',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://example.com', enabled: true }],
        },
        defaultModel: 'gpt-image-2',
      },
      models: [{ id: 'cached-model' }],
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    };
    const repository = createRepository([existing]);
    setProviderProfileRepository(repository);

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
          defaultModels: [{ id: 'gpt-image-2' }],
        };
      },
      validateConfig(input) {
        return input as ProviderConfig;
      },
      validateRequest(input) {
        return input as ProviderRequest;
      },
      async invoke() {
        throw new Error('invoke not used');
      },
      async discoverModels() {
        return [{ id: 'gpt-image-2' }, { id: 'gpt-image-1' }];
      },
    };
    registry.register(provider);
    _setRuntimeInstanceForTesting({ providerRegistry: registry } as never);

    const result = await refreshDraftProfileModels({
      profileId: 'profile-a',
      apiFormat: 'openai-images',
      config: {
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://changed.example.com', enabled: true }],
        },
        defaultModel: 'gpt-image-2',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((model) => model.id)).toEqual([
        'gpt-image-2',
        'gpt-image-1',
        'dall-e-3',
        'grok-imagine-image-pro',
        'grok-imagine-image',
        'doubao-seedream-5-0-260128',
        'qwen-image-2.0-2026-03-03',
      ]);
    }
    const persisted = await getProfile(repository, 'profile-a');
    expect(persisted?.models).toEqual([{ id: 'cached-model' }]);
  });

  it('surfaces discovery failure without changing save semantics', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([]));

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
        throw new Error('invoke not used');
      },
      async discoverModels() {
        throw new Error('draft discovery failed');
      },
    };
    registry.register(provider);
    _setRuntimeInstanceForTesting({ providerRegistry: registry } as never);

    const result = await refreshDraftProfileModels({
      apiFormat: 'openai-images',
      displayName: 'Draft',
      config: {
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://broken.example.com', enabled: true }],
        },
        defaultModel: 'custom-model-x',
      },
      secretValues: { apiKey: 'test-key' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('draft discovery failed');
    }
  });

  it('returns validation error when draft config validation fails', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([]));

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
      validateConfig() {
        const error = new Error('invalid provider config');
        error.name = 'ProviderValidationError';
        throw error;
      },
      validateRequest(input) {
        return input as ProviderRequest;
      },
      async invoke() {
        throw new Error('invoke not used');
      },
      async discoverModels() {
        return [];
      },
    };
    registry.register(provider);
    _setRuntimeInstanceForTesting({ providerRegistry: registry } as never);

    const result = await refreshDraftProfileModels({
      apiFormat: 'openai-images',
      displayName: 'Draft',
      config: {
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://broken.example.com', enabled: true }],
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('validation');
      expect(result.error.message).toBe('invalid provider config');
    }
  });
});

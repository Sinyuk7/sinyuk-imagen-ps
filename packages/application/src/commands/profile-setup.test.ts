import { beforeEach, describe, expect, it } from 'vitest';
import { type ApiFormat, type Provider, type ProviderDescriptor, type ProviderProfileTemplate } from '@imagen-ps/providers';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setUserModelConfigRepository,
} from '../runtime.js';
import {
  continueProviderProfileSetup,
  getProviderSetupProfile,
  listProviderProfiles,
} from './provider-profiles.js';
import type {
  ProviderProfile,
  ProviderProfileInput,
  ProviderProfileRepository,
  SecretStorageAdapter,
  UserModelConfig,
  UserModelConfigRepository,
} from './types.js';

function createProfileRepository(): {
  readonly repository: ProviderProfileRepository;
  readonly values: Map<string, ProviderProfile>;
} {
  const values = new Map<string, ProviderProfile>();
  return {
    values,
    repository: {
      async list() {
        return Array.from(values.values());
      },
      async get(profileId) {
        return values.get(profileId);
      },
      async save(profile) {
        values.set(profile.profileId, profile);
      },
      async delete(profileId) {
        values.delete(profileId);
      },
    },
  };
}

function createUserModelConfigRepository(options?: {
  readonly initializeProfile?: (profileId: string, configs: readonly UserModelConfig[]) => Promise<void>;
}): {
  readonly repository: UserModelConfigRepository;
  readonly values: Map<string, UserModelConfig>;
} {
  const values = new Map<string, UserModelConfig>();
  return {
    values,
    repository: {
      async list(profileId) {
        return Array.from(values.values()).filter((config) => config.profileId === profileId);
      },
      async get(profileId, modelId) {
        return values.get(`${profileId}:${modelId}`);
      },
      async save(config) {
        values.set(`${config.profileId}:${config.modelId}`, config);
      },
      async initializeProfile(profileId, configs) {
        if (options?.initializeProfile) {
          await options.initializeProfile(profileId, configs);
          return;
        }
        for (const config of configs) {
          values.set(`${config.profileId}:${config.modelId}`, config);
        }
      },
      async deleteUnlessLast(profileId, modelId) {
        const owned = Array.from(values.values()).filter((config) => config.profileId === profileId);
        if (owned.length <= 1) {
          return false;
        }
        values.delete(`${profileId}:${modelId}`);
        return true;
      },
      async deleteProfile(profileId) {
        for (const key of Array.from(values.keys())) {
          if (key.startsWith(`${profileId}:`)) {
            values.delete(key);
          }
        }
      },
    },
  };
}

function createSecretStorage(): SecretStorageAdapter & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getSecret(key) {
      return values.get(key);
    },
    async setSecret(key, value) {
      values.set(key, value);
    },
    async deleteSecret(key) {
      values.delete(key);
    },
  };
}

function createProviderDescriptor(): ProviderDescriptor {
  return {
    id: 'image-endpoint',
    family: 'image-endpoint',
    apiFormat: 'openai-images',
    displayName: 'Image Endpoint',
    operations: ['text_to_image', 'image_edit'],
    invokeMode: 'sync',
    defaultModelTemplates: [
      {
        apiFormat: 'openai-images',
        modelId: 'gpt-image-2',
        wireModelId: 'wire-a',
        baseModelId: 'gpt-image-2',
      },
      {
        apiFormat: 'openai-images',
        modelId: 'gpt-image-2-alt',
        wireModelId: 'wire-b',
        baseModelId: 'gpt-image-2',
      },
    ],
    profileTemplate: {
      endpointUrl: 'https://provider.test/v1',
      paths: { generation: '/images/generations' },
      authMode: 'bearer',
      defaultModelId: 'gpt-image-2',
    } satisfies ProviderProfileTemplate,
  };
}

function installRuntime(descriptor: ProviderDescriptor): void {
  const provider: Provider = {
    id: descriptor.id,
    family: descriptor.family,
    describe: () => descriptor,
    validateConfig: (input) => input as never,
    validateRequest: (input) => input as never,
    invoke: async () => ({ assets: [], text: '', raw: null }),
  };

    _setRuntimeInstanceForTesting({
      providerRegistry: {
        list: () => [provider.describe()],
        get: (providerId: string) => (providerId === provider.id ? provider : undefined),
        getByApiFormat: (apiFormat: ApiFormat) => (apiFormat === descriptor.apiFormat ? provider : undefined),
      },
    } as never);
  }

function profileInput(profileId: string): ProviderProfileInput {
  return {
    profileId,
    apiFormat: 'openai-images',
    displayName: 'Profile A',
    config: {
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://provider.test/v1', enabled: true }],
      },
      paths: { generation: '/images/generations' },
    },
  };
}

beforeEach(() => {
  _resetForTesting();
});

describe('provider profile setup', () => {
  it('initializes the full default model template set and becomes ready', async () => {
    const descriptor = createProviderDescriptor();
    installRuntime(descriptor);

    const profiles = createProfileRepository();
    const models = createUserModelConfigRepository();
    const secrets = createSecretStorage();
    setProviderProfileRepository(profiles.repository);
    setUserModelConfigRepository(models.repository);
    setSecretStorageAdapter(secrets);

    const result = await continueProviderProfileSetup({
      profile: profileInput('setup-ready'),
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.kind : null).toBe('ready');
    expect(result.ok ? result.value.profile.lifecycle : null).toBe('ready');
    expect(Array.from(models.values.values())).toHaveLength(2);
    expect(Array.from(models.values.values()).map((model) => model.modelId)).toEqual([
      'gpt-image-2',
      'gpt-image-2-alt',
    ]);
    expect(await listProviderProfiles()).toMatchObject({ ok: true, value: [{ profileId: 'setup-ready' }] });
  });

  it('keeps setup hidden when model initialization fails', async () => {
    const descriptor = createProviderDescriptor();
    installRuntime(descriptor);

    const profiles = createProfileRepository();
    const models = createUserModelConfigRepository({
      async initializeProfile() {
        throw new Error('boom');
      },
    });
    const secrets = createSecretStorage();
    setProviderProfileRepository(profiles.repository);
    setUserModelConfigRepository(models.repository);
    setSecretStorageAdapter(secrets);

    const result = await continueProviderProfileSetup({
      profile: profileInput('setup-failed'),
    });

    expect(result.ok).toBe(false);
    expect(await getProviderSetupProfile('setup-failed')).toMatchObject({
      ok: true,
      value: { lifecycle: 'setup' },
    });
    expect(await listProviderProfiles()).toMatchObject({ ok: true, value: [] });
    expect(profiles.values.get('setup-failed')).toMatchObject({ lifecycle: 'setup' });
  });
});

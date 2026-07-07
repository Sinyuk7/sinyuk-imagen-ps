import { beforeEach, describe, expect, it } from 'vitest';
import type { ProviderConfig } from '@imagen-ps/providers';
import { testProviderProfileConnection } from './profile-connection-test.js';
import { testProviderProfile } from './provider-profiles.js';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  setProviderConfigResolver,
  setProviderProfileRepository,
  setUserModelConfigRepository,
} from '../runtime.js';
import type {
  ProviderConfigResolver,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileRepository,
  UserModelConfig,
  UserModelConfigRepository,
} from './types.js';

function createUserConfigRepository(configs: readonly UserModelConfig[]): UserModelConfigRepository {
  return {
    async list(apiFormat) {
      return apiFormat ? configs.filter((config) => config.apiFormat === apiFormat) : configs;
    },
    async get(apiFormat, modelId) {
      return configs.find((config) => config.apiFormat === apiFormat && config.modelId === modelId);
    },
    async save() {
      throw new Error('save not implemented in test repository');
    },
    async delete() {
      throw new Error('delete not implemented in test repository');
    },
  };
}

function createProfileRepository(profiles: readonly ProviderProfile[]): ProviderProfileRepository {
  return {
    async list() {
      return profiles;
    },
    async get(profileId) {
      return profiles.find((profile) => profile.profileId === profileId);
    },
    async save() {
      throw new Error('save not implemented in test repository');
    },
    async delete() {
      throw new Error('delete not implemented in test repository');
    },
  };
}

function createFakeProviderConfig(displayName: string): ProviderProfileConfig {
  return {
    apiFormat: 'gemini-generate-content',
    displayName,
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [{ id: 'primary', url: 'https://grsai.dakka.com.cn/v1beta', enabled: true }],
    },
    paths: {
      invokeTemplate: '/models/{model}:generateContent',
    },
    authMode: 'bearer',
  };
}

function createFakeResolvedProviderConfig(displayName: string): ProviderConfig {
  return {
    providerId: 'gemini-generate-content',
    displayName,
    family: 'gemini-generate-content',
    apiFormat: 'gemini-generate-content',
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [{ id: 'primary', url: 'https://grsai.dakka.com.cn/v1beta', enabled: true }],
    },
    paths: {
      invokeTemplate: '/models/{model}:generateContent',
    },
    authMode: 'bearer',
  };
}

function createUserModelConfig(): UserModelConfig {
  return {
    apiFormat: 'gemini-generate-content',
    modelId: 'gemini-3.1-flash-lite-image',
    baseModelId: 'gemini-3.1-flash-lite-image',
    wireModelId: 'nano-banana-2-lite',
    requestStrategyId: 'gemini-generate-content-image-config',
    outputExposure: {
      kind: 'ratio-resolution',
      aspectRatios: ['1:1'],
      resolutions: ['2k'],
      outputFormats: ['png'],
    },
    outputMatrix: [],
  };
}

describe('safe probe model resolution', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('resolves draft connection test through wireModelId', async () => {
    const probeContexts: Array<{ readonly modelId?: string }> = [];
    const safeProbe = async (_config: unknown, context: { readonly modelId?: string }) => {
      probeContexts.push(context);
      return { status: 'verified', reason: 'verified' } as const;
    };
    _setRuntimeInstanceForTesting({
      providerRegistry: {
        list: () => [],
        get: () => undefined,
        getByApiFormat: () => ({
          id: 'fake-gemini',
          family: 'image-endpoint',
          describe: () => ({ connectivity: { connectionTest: 'supported' } }),
          validateConfig: (input: unknown) => input,
          safeProbe,
        }),
      },
    } as never);
    setUserModelConfigRepository(createUserConfigRepository([createUserModelConfig()]));

    const result = await testProviderProfileConnection({
      apiFormat: 'gemini-generate-content',
      displayName: 'grsai',
      config: createFakeProviderConfig('grsai'),
      selectedModelIds: ['gemini-3.1-flash-lite-image'],
      defaultModelId: 'gemini-3.1-flash-lite-image',
      secretValues: { apiKey: 'test-key' },
    });

    expect(result.ok).toBe(true);
    expect(probeContexts).toEqual([{ modelId: 'nano-banana-2-lite' }]);
  });

  it('resolves saved profile connection test through wireModelId', async () => {
    const probeContexts: Array<{ readonly modelId?: string }> = [];
    const safeProbe = async (_config: unknown, context: { readonly modelId?: string }) => {
      probeContexts.push(context);
      return { status: 'verified', reason: 'verified' } as const;
    };
    _setRuntimeInstanceForTesting({
      providerRegistry: {
        list: () => [],
        get: () => undefined,
        getByApiFormat: () => ({
          id: 'fake-gemini',
          family: 'image-endpoint',
          describe: () => ({ connectivity: { connectionTest: 'supported' } }),
          validateConfig: (input: unknown) => input,
          safeProbe,
        }),
      },
    } as never);
    setUserModelConfigRepository(createUserConfigRepository([createUserModelConfig()]));

    const profile: ProviderProfile = {
      profileId: 'profile-grsai',
      apiFormat: 'gemini-generate-content',
      displayName: 'grsai',
      enabled: true,
      config: createFakeProviderConfig('grsai'),
      selectedModelIds: ['gemini-3.1-flash-lite-image'],
      defaultModelId: 'gemini-3.1-flash-lite-image',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    };
    setProviderProfileRepository(createProfileRepository([profile]));
    setProviderConfigResolver({
      async resolve(profileId) {
        return {
          profileId,
          apiFormat: 'gemini-generate-content',
          implementationId: 'gemini-generate-content',
          providerConfig: createFakeResolvedProviderConfig('grsai'),
        };
      },
    } satisfies ProviderConfigResolver);

    const result = await testProviderProfile('profile-grsai', { connect: true });

    expect(result.ok).toBe(true);
    expect(probeContexts).toEqual([{ modelId: 'nano-banana-2-lite' }]);
  });
});

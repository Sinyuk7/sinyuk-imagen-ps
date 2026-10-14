import { beforeEach, describe, expect, it } from 'vitest';
import { createGrsaiGenerateProvider, createImageEndpointProvider, type ProviderDescriptor } from '@imagen-ps/providers';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setUserModelConfigRepository,
} from '../runtime.js';
import type {
  ProviderProfile,
  ProviderProfileRepository,
  SecretStorageAdapter,
  UserModelConfig,
  UserModelConfigRepository,
} from './types.js';
import { deleteProviderProfile } from './provider-profiles.js';
import { projectProviderSurface, saveProviderSurfaceProfile } from './provider-surface.js';

const descriptor: ProviderDescriptor = {
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
      wireModelId: 'wire-gpt-image-2',
      baseModelId: 'gpt-image-2',
    },
  ],
  profileTemplate: {
    endpointUrl: 'https://example.test/v1',
    paths: { generation: '/images/generations', edit: '/images/edits' },
    authMode: 'bearer',
    defaultModelId: 'gpt-image-2',
  },
  transport: {
    idempotency: 'supported',
    wire: {
      supportedEditCodecs: ['multipart-bracket'],
      responseCodecs: ['json'],
    },
  },
  connectivity: { connectionTest: 'unsupported' },
};

function createProfileRepository(): ProviderProfileRepository & { readonly values: Map<string, ProviderProfile> } {
  const values = new Map<string, ProviderProfile>();
  return {
    values,
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
  };
}

function createModelRepository(): UserModelConfigRepository & { readonly values: Map<string, UserModelConfig> } {
  const values = new Map<string, UserModelConfig>();
  return {
    values,
    async list(profileId) {
      return Array.from(values.values()).filter((model) => model.profileId === profileId);
    },
    async get(profileId, modelId) {
      return values.get(`${profileId}:${modelId}`);
    },
    async save(config) {
      values.set(`${config.profileId}:${config.modelId}`, config);
    },
    async initializeProfile(profileId, configs) {
      const next = new Map(values);
      for (const config of configs) {
        if (config.profileId !== profileId) throw new Error('Wrong profile owner.');
        next.set(`${config.profileId}:${config.modelId}`, config);
      }
      values.clear();
      for (const [key, value] of next) values.set(key, value);
    },
    async deleteUnlessLast(profileId, modelId) {
      const owned = Array.from(values.values()).filter((model) => model.profileId === profileId);
      if (owned.length <= 1) return false;
      values.delete(`${profileId}:${modelId}`);
      return true;
    },
    async deleteProfile(profileId) {
      for (const key of Array.from(values.keys())) {
        if (key.startsWith(`${profileId}:`)) values.delete(key);
      }
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

let profiles: ReturnType<typeof createProfileRepository>;
let models: ReturnType<typeof createModelRepository>;
let secrets: ReturnType<typeof createSecretStorage>;

beforeEach(() => {
  _resetForTesting();
  profiles = createProfileRepository();
  models = createModelRepository();
  secrets = createSecretStorage();
  setProviderProfileRepository(profiles);
  setUserModelConfigRepository(models);
  setSecretStorageAdapter(secrets);

  const provider = createImageEndpointProvider();
  const grsai = createGrsaiGenerateProvider();
  _setRuntimeInstanceForTesting({
    providerRegistry: {
      list: () => [provider.describe(), grsai.describe()],
      get: (providerId: string) => providerId === provider.id ? provider : providerId === grsai.id ? grsai : undefined,
      getByApiFormat: (apiFormat: string) => apiFormat === 'openai-images' ? provider : apiFormat === 'grsai' ? grsai : undefined,
    },
  } as never);
});

describe('provider surface projection', () => {
  it('只投影 UI 所需的 canonical identity、模型和连接测试能力', () => {
    const projected = projectProviderSurface(descriptor);

    expect(projected).toEqual({
      identity: {
        apiFormat: 'openai-images',
        implementationId: 'image-endpoint',
      },
      operations: ['text_to_image', 'image_edit'],
      defaultModelId: 'gpt-image-2',
      modelIds: ['gpt-image-2'],
      canTestConnection: false,
    });
    expect(projected).not.toHaveProperty('profileTemplate');
    expect(projected).not.toHaveProperty('transport');
    expect(projected).not.toHaveProperty('billing');
    expect(projected).not.toHaveProperty('wire');
    expect(projected).not.toHaveProperty('endpointUrl');
    expect(projected).not.toHaveProperty('paths');
    expect(projected).not.toHaveProperty('authMode');
  });

  it('拒绝 apiFormat 与 implementation 不一致的 descriptor', () => {
    expect(projectProviderSurface({ ...descriptor, id: 'grsai-generate' })).toBeUndefined();
  });

  it('不向 UI 暴露没有固定 Profile template 的 provider', () => {
    expect(projectProviderSurface({ ...descriptor, profileTemplate: undefined })).toBeUndefined();
  });
});

describe('provider surface profile save', () => {
  it('从 Provider-owned template 创建 ready Profile 并隔离 API Key', async () => {
    const result = await saveProviderSurfaceProfile({
      implementationId: 'image-endpoint',
      profileId: 'openai-main',
      displayName: 'OpenAI Main',
      apiKey: 'sk-secret',
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.lifecycle : undefined).toBe('ready');
    expect(profiles.values.get('openai-main')).toMatchObject({
      apiFormat: 'openai-images',
      displayName: 'OpenAI Main',
      lifecycle: 'ready',
      config: {
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://api.openai.com/v1', enabled: true }],
        },
        paths: { generation: '/images/generations', edit: '/images/edits' },
        billing: { source: 'disabled' },
      },
      secretRefs: { apiKey: 'secret:provider-profile:openai-main:apiKey' },
    });
    expect(profiles.values.get('openai-main')?.config).not.toHaveProperty('apiKey');
    expect(secrets.values.get('secret:provider-profile:openai-main:apiKey')).toBe('sk-secret');
    expect(Array.from(models.values.values())).toMatchObject([
      { profileId: 'openai-main', apiFormat: 'openai-images', modelId: 'gpt-image-2' },
    ]);
  });

  it('编辑时保留固定配置并替换 API Key', async () => {
    await saveProviderSurfaceProfile({
      implementationId: 'image-endpoint',
      profileId: 'openai-edit',
      displayName: 'Before',
      apiKey: 'sk-before',
    });

    const result = await saveProviderSurfaceProfile({
      implementationId: 'image-endpoint',
      profileId: 'openai-edit',
      displayName: 'After',
      apiKey: 'sk-after',
    });

    expect(result.ok).toBe(true);
    expect(profiles.values.get('openai-edit')?.displayName).toBe('After');
    expect(secrets.values.get('secret:provider-profile:openai-edit:apiKey')).toBe('sk-after');
  });

  it('GRSAI Token 只写入 SecretStorage，并固定余额查询配置', async () => {
    const result = await saveProviderSurfaceProfile({
      implementationId: 'grsai-generate',
      profileId: 'grsai-token',
      displayName: 'GRSAI Token',
      apiKey: 'grsai-key',
      billingToken: 'grsai-token-secret',
    });

    expect(result.ok).toBe(true);
    expect(profiles.values.get('grsai-token')?.config).toMatchObject({
      billing: { source: 'billing-token', path: '/client/openapi/getCredits' },
    });
    expect(profiles.values.get('grsai-token')?.config).not.toHaveProperty('billingToken');
    expect(secrets.values.get('secret:provider-profile:grsai-token:billingToken')).toBe('grsai-token-secret');
  });

  it('允许显式移除已保存 API Key，但不把旧 secret 写回 Profile', async () => {
    await saveProviderSurfaceProfile({
      implementationId: 'image-endpoint',
      profileId: 'openai-remove-key',
      displayName: 'OpenAI',
      apiKey: 'sk-remove',
    });

    const result = await saveProviderSurfaceProfile({
      implementationId: 'image-endpoint',
      profileId: 'openai-remove-key',
      displayName: 'OpenAI',
      removeSavedApiKey: true,
    });

    expect(result.ok).toBe(true);
    expect(profiles.values.get('openai-remove-key')?.secretRefs).toBeUndefined();
    expect(secrets.values).toHaveLength(0);
  });

  it('删除 Profile 时同时清理模型与 secret', async () => {
    await saveProviderSurfaceProfile({
      implementationId: 'image-endpoint',
      profileId: 'openai-delete',
      displayName: 'OpenAI Delete',
      apiKey: 'sk-delete',
    });

    const result = await deleteProviderProfile('openai-delete');

    expect(result).toMatchObject({ ok: true });
    expect(profiles.values).toHaveLength(0);
    expect(models.values).toHaveLength(0);
    expect(secrets.values).toHaveLength(0);
  });
});

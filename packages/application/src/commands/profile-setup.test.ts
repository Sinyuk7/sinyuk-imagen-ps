import { getOfficialModelPreset } from '@imagen-ps/providers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setUserModelConfigRepository,
} from '../runtime.js';
import {
  cancelProviderProfileSetup,
  continueProviderProfileSetup,
  getProviderProfile,
  getProviderSetupProfile,
  listProviderProfiles,
  promoteProviderProfileSetup,
} from './provider-profiles.js';
import { saveUserModelConfig } from './model-configs.js';
import type {
  ProviderProfile,
  ProviderProfileInput,
  ProviderProfileRepository,
  SecretStorageAdapter,
  UserModelConfig,
  UserModelConfigRepository,
} from './types.js';

function profileInput(profileId: string): ProviderProfileInput {
  return {
    profileId,
    apiFormat: 'openai-images',
    displayName: 'Test Profile',
    config: {
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://provider.test/v1', enabled: true }],
      },
      paths: { generation: '/images/generations' },
    },
    secretValues: { apiKey: 'test-secret' },
  };
}

function createProfileRepository(): {
  readonly repository: ProviderProfileRepository;
  readonly values: Map<string, ProviderProfile>;
} {
  const values = new Map<string, ProviderProfile>();
  return {
    values,
    repository: {
      async list() { return Array.from(values.values()); },
      async get(profileId) { return values.get(profileId); },
      async save(profile) { values.set(profile.profileId, profile); },
      async delete(profileId) { values.delete(profileId); },
    },
  };
}

function createModelRepository(): {
  readonly repository: UserModelConfigRepository;
  readonly values: Map<string, UserModelConfig>;
} {
  const values = new Map<string, UserModelConfig>();
  const key = (profileId: string, modelId: string) => `${profileId}:${modelId}`;
  const forProfile = (profileId: string) => Array.from(values.values()).filter((config) => config.profileId === profileId);
  return {
    values,
    repository: {
      async list(profileId) { return forProfile(profileId); },
      async get(profileId, modelId) { return values.get(key(profileId, modelId)); },
      async save(config) { values.set(key(config.profileId, config.modelId), config); },
      async deleteUnlessLast(profileId, modelId) {
        if (forProfile(profileId).length <= 1) return false;
        values.delete(key(profileId, modelId));
        return true;
      },
      async deleteProfile(profileId) {
        for (const config of forProfile(profileId)) values.delete(key(config.profileId, config.modelId));
      },
    },
  };
}

function createSecrets(): SecretStorageAdapter & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getSecret(key) { return values.get(key); },
    async setSecret(key, value) { values.set(key, value); },
    async deleteSecret(key) { values.delete(key); },
  };
}

beforeEach(() => {
  _resetForTesting();
  _setRuntimeInstanceForTesting({
    providerRegistry: {
      list: () => [],
      get: () => undefined,
      getByApiFormat: () => ({
        id: 'image-endpoint',
        family: 'image-endpoint',
        describe: () => ({ displayName: 'Test Provider' }),
        validateConfig: (input: unknown) => input,
      }),
    },
  } as never);
});

describe('Profile setup completion', () => {
  it('keeps an unknown hint in setup, excludes it from public reads, then cleans profile and secrets on cancel', async () => {
    const profiles = createProfileRepository();
    const models = createModelRepository();
    const secrets = createSecrets();
    setProviderProfileRepository(profiles.repository);
    setUserModelConfigRepository(models.repository);
    setSecretStorageAdapter(secrets);

    const result = await continueProviderProfileSetup({
      profile: profileInput('setup-unknown'),
      wireModelId: 'unknown-provider-alias',
    });

    expect(result).toMatchObject({ ok: true, value: { kind: 'model-configuration', wireModelId: 'unknown-provider-alias' } });
    expect(await listProviderProfiles()).toMatchObject({ ok: true, value: [] });
    expect(await getProviderProfile('setup-unknown')).toMatchObject({ ok: false });
    expect(await getProviderSetupProfile('setup-unknown')).toMatchObject({ ok: true, value: { lifecycle: 'setup' } });
    expect(secrets.values.size).toBe(1);

    expect(await cancelProviderProfileSetup('setup-unknown')).toMatchObject({ ok: true });
    expect(profiles.values.size).toBe(0);
    expect(models.values.size).toBe(0);
    expect(secrets.values.size).toBe(0);
  });

  it('auto-adds only an exact apiFormat-compatible Official Catalog hint and writes no enabled field', async () => {
    const profiles = createProfileRepository();
    const models = createModelRepository();
    setProviderProfileRepository(profiles.repository);
    setUserModelConfigRepository(models.repository);
    setSecretStorageAdapter(createSecrets());

    const result = await continueProviderProfileSetup({ profile: profileInput('setup-exact'), wireModelId: 'gpt-image-2' });

    expect(result).toMatchObject({ ok: true, value: { kind: 'ready', profile: { lifecycle: 'ready' } } });
    const publicProfiles = await listProviderProfiles();
    if (!publicProfiles.ok) throw new Error(publicProfiles.error.message);
    expect(publicProfiles.value).toHaveLength(1);
    expect(publicProfiles.value[0]).not.toHaveProperty('enabled');
    expect(Array.from(models.values.values())).toMatchObject([{ modelId: 'gpt-image-2', wireModelId: 'gpt-image-2' }]);
    expect(await promoteProviderProfileSetup('setup-exact')).toMatchObject({ ok: true, value: { lifecycle: 'ready' } });
  });

  it('promotes setup exactly once after its first successful explicit model save', async () => {
    const profiles = createProfileRepository();
    const models = createModelRepository();
    setProviderProfileRepository(profiles.repository);
    setUserModelConfigRepository(models.repository);
    setSecretStorageAdapter(createSecrets());

    await continueProviderProfileSetup({ profile: profileInput('setup-first-model') });
    const preset = getOfficialModelPreset('openai-images', 'gpt-image-2');
    if (!preset) throw new Error('Expected gpt-image-2 official preset.');
    const saved = await saveUserModelConfig({
      profileId: 'setup-first-model',
      apiFormat: 'openai-images',
      modelId: preset.modelId,
      baseModelId: preset.modelId,
      wireModelId: preset.modelId,
      requestStrategyId: preset.requestStrategyId,
      outputExposure: preset.outputExposure,
    });

    expect(saved).toMatchObject({ ok: true });
    expect(await getProviderProfile('setup-first-model')).toMatchObject({ ok: true, value: { lifecycle: 'ready' } });
    expect(await promoteProviderProfileSetup('setup-first-model')).toMatchObject({ ok: true, value: { lifecycle: 'ready' } });
  });
});

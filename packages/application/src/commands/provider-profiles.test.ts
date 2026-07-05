import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetForTesting,
  setProviderProfileRepository,
  setSecretStorageAdapter,
} from '../runtime.js';
import { listProviderProfiles, saveProviderProfile, testProviderProfile } from './provider-profiles.js';
import type { ProviderProfile, ProviderProfileInput, ProviderProfileRepository, SecretStorageAdapter } from './types.js';

function createProfileRepository(): {
  readonly repository: ProviderProfileRepository;
  readonly profiles: ProviderProfile[];
} {
  const profiles: ProviderProfile[] = [];
  return {
    profiles,
    repository: {
      async list() {
        return profiles;
      },
      async get(profileId: string) {
        return profiles.find((profile) => profile.profileId === profileId);
      },
      async save(profile: ProviderProfile) {
        const index = profiles.findIndex((item) => item.profileId === profile.profileId);
        if (index >= 0) {
          profiles[index] = profile;
          return;
        }
        profiles.push(profile);
      },
      async delete(profileId: string) {
        const index = profiles.findIndex((profile) => profile.profileId === profileId);
        if (index >= 0) {
          profiles.splice(index, 1);
        }
      },
    },
  };
}

function createSecretStorage(): {
  readonly adapter: SecretStorageAdapter;
  readonly secrets: Map<string, string>;
} {
  const secrets = new Map<string, string>();
  return {
    secrets,
    adapter: {
      async getSecret(key: string) {
        return secrets.get(key);
      },
      async setSecret(key: string, value: string) {
        secrets.set(key, value);
      },
      async deleteSecret(key: string) {
        secrets.delete(key);
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockProfileInput(profileId: string, displayName: string, model: string, apiKey: string): ProviderProfileInput {
  return {
    profileId,
    apiFormat: 'openai-images',
    displayName,
    config: {
      apiFormat: 'openai-images',      displayName,
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
      },
      defaultModel: model,
    },
    secretValues: {
      apiKey,
    },
  };
}

describe('provider profile alias contract', () => {
  it('allows same provider endpoint with different unique aliases', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const first = await saveProviderProfile(mockProfileInput('profile-a', 'Nano Banana', 'gpt-image-2', 'key-a'));
    const second = await saveProviderProfile(mockProfileInput('profile-b', 'GPT Image 2', 'gpt-image-2', 'key-b'));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(profiles.map((profile) => profile.displayName)).toEqual(['Nano Banana', 'GPT Image 2']);
    expect(
      profiles.map((profile) =>
        ((profile.config.connection as { readonly endpoints?: Array<{ readonly url?: string }> } | undefined)?.endpoints?.[0]?.url),
      ),
    ).toEqual(['https://mock.local/', 'https://mock.local/']);
  });

  it('filters and deletes legacy prompt optimizer profiles during list', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter, secrets } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    profiles.push(
      {
        profileId: '__prompt-optimizer__',
        apiFormat: 'openai-chat-completions',
        displayName: 'Prompt Optimizer',
        enabled: false,
        config: {
          defaultModel: 'gpt-4o-mini',
        },
        secretRefs: {
          apiKey: 'secret:provider-profile:__prompt-optimizer__:apiKey',
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
      {
        profileId: 'profile-ok',
        apiFormat: 'openai-images',
        displayName: 'Image Relay',
        enabled: true,
        config: {},
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
    );
    secrets.set('secret:provider-profile:__prompt-optimizer__:apiKey', 'legacy-key');

    const result = await listProviderProfiles();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((profile) => profile.profileId)).toEqual(['profile-ok']);
    }
    expect(profiles.map((profile) => profile.profileId)).toEqual(['profile-ok']);
    expect(secrets.has('secret:provider-profile:__prompt-optimizer__:apiKey')).toBe(false);
  });

  it('rejects duplicate aliases without changing existing profile or secrets', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter, secrets } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const first = await saveProviderProfile(mockProfileInput('profile-a', 'Relay A', 'gpt-image-2', 'key-a'));
    expect(first.ok).toBe(true);
    const before = JSON.stringify(profiles);

    const duplicate = await saveProviderProfile(mockProfileInput('profile-b', 'Relay A', 'mock-image-v2', 'key-b'));

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.message).toContain('displayName "Relay A" already exists');
    }
    expect(JSON.stringify(profiles)).toBe(before);
    expect(secrets.has('secret:provider-profile:profile-b:apiKey')).toBe(false);
  });

  it('returns Gemini connectivity model details from native discovery', async () => {
    _resetForTesting();
    const { repository } = createProfileRepository();
    const { adapter } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      models: [
        {
          name: 'models/gemini-3.1-flash-image',
          displayName: 'Gemini 3.1 Flash Image',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const saved = await saveProviderProfile({
      profileId: 'profile-a',
      apiFormat: 'gemini-generate-content',
      displayName: 'Gemini Endpoint',
      config: {
        displayName: 'Gemini Endpoint',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://gemini.local/v1beta', enabled: true }],
        },
        authMode: 'none',
        defaultModel: 'gemini-3.1-flash-image',
      },
    });
    expect(saved.ok).toBe(true);

    const result = await testProviderProfile('profile-a', { connect: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connectivity).toMatchObject({
        reachable: true,
        modelCount: 1,
        models: [{ id: 'gemini-3.1-flash-image' }],
      });
    }
  });

  it('reports only selectable discovered models in connectivity count', async () => {
    _resetForTesting();
    const { repository } = createProfileRepository();
    const { adapter } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const saved = await saveProviderProfile({
      profileId: 'profile-image',
      apiFormat: 'openai-chat-completions',
      displayName: 'Chat Image',
      config: {
        apiFormat: 'openai-chat-completions',        displayName: 'Chat Image',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
        },
        defaultModel: 'google/gemini-2.5-flash-image-preview',
      },
      secretValues: { apiKey: 'key-a' },
    });
    expect(saved.ok).toBe(true);

    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      data: [{ id: 'openai/gpt-image-2', architecture: { output_modalities: ['image', 'text'] } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await testProviderProfile('profile-image', { connect: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connectivity?.modelCount).toBe(1);
      expect(result.value.connectivity?.models?.[0]).toMatchObject({
        id: 'openai/gpt-image-2',
        supportStatus: 'selectable',
      });
    }
  });

  it('persists billing access token on the secret boundary while keeping secret ref in sanitized config', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter, secrets } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const base = mockProfileInput('profile-c', 'Billing Mock', 'gpt-image-2', 'key-c');
    const saved = await saveProviderProfile({
      ...base,
      config: {
        ...base.config,
        billing: {
          mode: 'new-api',
          userId: '10001',
          accessTokenSecretRef: 'secret:pending:billingAccessToken',
        },
      },
      secretValues: {
        apiKey: 'key-c',
        billingAccessToken: 'billing-secret',
      },
    });

    expect(saved.ok).toBe(true);
    expect(secrets.get('secret:provider-profile:profile-c:billingAccessToken')).toBe('billing-secret');
    expect(profiles[0]?.config.billing).toEqual({
      mode: 'new-api',
      userId: '10001',
      accessTokenSecretRef: 'secret:provider-profile:profile-c:billingAccessToken',
    });
  });

  it('removes saved optional secrets only when removal is explicit', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter, secrets } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const base = mockProfileInput('profile-remove', 'Remove Secret', 'gpt-image-2', 'key-a');
    const saved = await saveProviderProfile({
      ...base,
      config: {
        ...base.config,
        billing: {
          mode: 'new-api',
          userId: '10001',
          accessTokenSecretRef: 'secret:pending:billingAccessToken',
        },
      },
      secretValues: {
        apiKey: 'key-a',
        billingAccessToken: 'billing-secret',
      },
    });
    expect(saved.ok).toBe(true);
    expect(secrets.get('secret:provider-profile:profile-remove:apiKey')).toBe('key-a');
    expect(secrets.get('secret:provider-profile:profile-remove:billingAccessToken')).toBe('billing-secret');

    const kept = await saveProviderProfile({
      profileId: 'profile-remove',
      config: {
        defaultModel: 'gpt-image-1',
      },
    });
    expect(kept.ok).toBe(true);
    expect(profiles[0]?.secretRefs?.billingAccessToken).toBe('secret:provider-profile:profile-remove:billingAccessToken');
    expect(secrets.get('secret:provider-profile:profile-remove:billingAccessToken')).toBe('billing-secret');

    const removed = await saveProviderProfile({
      profileId: 'profile-remove',
      removedSecretNames: ['billingAccessToken'],
      config: {
        defaultModel: 'dall-e-3',
        billing: { mode: 'none' },
      },
    });
    expect(removed.ok).toBe(true);
    expect(profiles[0]?.secretRefs?.apiKey).toBe('secret:provider-profile:profile-remove:apiKey');
    expect(profiles[0]?.secretRefs?.billingAccessToken).toBeUndefined();
    expect(secrets.get('secret:provider-profile:profile-remove:apiKey')).toBe('key-a');
    expect(secrets.has('secret:provider-profile:profile-remove:billingAccessToken')).toBe(false);
  });

  it('round-trips top-level systemInstruction without moving it into provider config', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const saved = await saveProviderProfile({
      ...mockProfileInput('profile-system', 'System Mock', 'gpt-image-2', 'key-system'),
      systemInstruction: '  keep leading spaces\nand trailing spaces  ',
    });

    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.value.systemInstruction).toBe('  keep leading spaces\nand trailing spaces  ');
      expect(saved.value.config).not.toHaveProperty('systemInstruction');
    }

    const listed = await listProviderProfiles();
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value[0]?.systemInstruction).toBe('  keep leading spaces\nand trailing spaces  ');
      expect(listed.value[0]?.config).not.toHaveProperty('systemInstruction');
    }
    expect(profiles[0]?.systemInstruction).toBe('  keep leading spaces\nand trailing spaces  ');
  });

  it('updates and clears systemInstruction while preserving unrelated profile fields', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const base = await saveProviderProfile({
      ...mockProfileInput('profile-edit-system', 'Edit System Mock', 'gpt-image-2', 'key-edit'),
      systemInstruction: 'first',
    });
    expect(base.ok).toBe(true);
    profiles[0] = {
      ...profiles[0]!,
      models: [{ id: 'cached-model', displayName: 'Cached Model' }],
    };
    const beforeConfig = profiles[0]!.config;
    const beforeSecretRefs = profiles[0]!.secretRefs;
    const beforeModels = profiles[0]!.models;

    const updated = await saveProviderProfile({
      profileId: 'profile-edit-system',
      apiFormat: 'openai-images',
      displayName: 'Edit System Mock',
      systemInstruction: 'second\nline',
      config: {},
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.systemInstruction).toBe('second\nline');
      expect(updated.value.config).toEqual(beforeConfig);
      expect(updated.value.secretRefs).toEqual(beforeSecretRefs);
      expect(updated.value.models).toEqual(beforeModels);
    }

    const cleared = await saveProviderProfile({
      profileId: 'profile-edit-system',
      apiFormat: 'openai-images',
      displayName: 'Edit System Mock',
      systemInstruction: '   \n\t  ',
      config: {},
    });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.value.systemInstruction).toBeUndefined();
      expect(cleared.value.config).toEqual(beforeConfig);
      expect(cleared.value.secretRefs).toEqual(beforeSecretRefs);
      expect(cleared.value.models).toEqual(beforeModels);
    }
  });

  it('reads legacy profiles without systemInstruction normally', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    profiles.push({
      profileId: 'legacy-profile',
      apiFormat: 'openai-images',
      displayName: 'Legacy Profile',
      enabled: true,
      config: {},
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    });

    const listed = await listProviderProfiles();
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value[0]).toMatchObject({ profileId: 'legacy-profile', displayName: 'Legacy Profile' });
      expect(listed.value[0]?.systemInstruction).toBeUndefined();
    }
  });
});

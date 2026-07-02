import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetForTesting,
  setProviderProfileRepository,
  setSecretStorageAdapter,
} from '../runtime.js';
import { saveProviderProfile, testProviderProfile } from './provider-profiles.js';
import type { ProviderProfile, ProviderProfileRepository, SecretStorageAdapter } from './types.js';

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

function mockProfileInput(profileId: string, displayName: string, model: string, apiKey: string) {
  return {
    profileId,
    providerId: 'mock',
    displayName,
    config: {
      providerId: 'mock',
      family: 'image-endpoint',
      displayName,
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
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

    const first = await saveProviderProfile(mockProfileInput('profile-a', 'Nano Banana', 'nano-banana', 'key-a'));
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

  it('rejects duplicate aliases without changing existing profile or secrets', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter, secrets } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const first = await saveProviderProfile(mockProfileInput('profile-a', 'Relay A', 'model-a', 'key-a'));
    expect(first.ok).toBe(true);
    const before = JSON.stringify(profiles);

    const duplicate = await saveProviderProfile(mockProfileInput('profile-b', 'Relay A', 'model-b', 'key-b'));

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.message).toContain('displayName "Relay A" already exists');
    }
    expect(JSON.stringify(profiles)).toBe(before);
    expect(secrets.has('secret:provider-profile:profile-b:apiKey')).toBe(false);
  });

  it('returns connectivity error details when discovery is unavailable', async () => {
    _resetForTesting();
    const { repository } = createProfileRepository();
    const { adapter } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const saved = await saveProviderProfile(mockProfileInput('profile-a', 'Mock Endpoint', 'mock-image-v1', 'key-a'));
    expect(saved.ok).toBe(true);

    const result = await testProviderProfile('profile-a', { connect: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connectivity).toMatchObject({
        reachable: false,
        errorMessage: 'Provider implementation "mock" does not support model discovery.',
      });
    }
  });

  it('reports only selectable discovered models in connectivity count and keeps the saved default visible', async () => {
    _resetForTesting();
    const { repository } = createProfileRepository();
    const { adapter } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const saved = await saveProviderProfile({
      profileId: 'profile-image',
      providerId: 'chat-image',
      displayName: 'Chat Image',
      config: {
        providerId: 'chat-image',
        family: 'chat-image',
        displayName: 'Chat Image',
        connection: {
          selectionMode: 'manual',
          failoverEnabled: false,
          preferredEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
        },
        defaultModel: 'google/gemini-2.5-flash-image-preview',
      },
      secretValues: { apiKey: 'key-a' },
    });
    expect(saved.ok).toBe(true);

    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      data: [{ id: 'openai/gpt-image-2', architecture: { output_modalities: ['image'] } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await testProviderProfile('profile-image', { connect: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connectivity?.modelCount).toBe(1);
      expect(result.value.connectivity?.models?.[0]).toMatchObject({
        id: 'google/gemini-2.5-flash-image-preview',
        supportStatus: 'saved-undiscovered',
      });
    }
  });

  it('persists billing access token on the secret boundary while keeping secret ref in sanitized config', async () => {
    _resetForTesting();
    const { repository, profiles } = createProfileRepository();
    const { adapter, secrets } = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(adapter);

    const base = mockProfileInput('profile-c', 'Billing Mock', 'mock-image-v1', 'key-c');
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
});

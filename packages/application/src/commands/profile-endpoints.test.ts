import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetForTesting, setProviderProfileRepository, setSecretStorageAdapter } from '../runtime.js';
import type { ProviderProfile, ProviderProfileRepository, SecretStorageAdapter } from './types.js';
import { measureProfileEndpoints } from './profile-endpoints.js';

function createProfileRepository(profiles: ProviderProfile[] = []): {
  readonly repository: ProviderProfileRepository;
  readonly saveSpy: ReturnType<typeof vi.fn>;
} {
  const saveSpy = vi.fn(async (profile: ProviderProfile) => {
    const index = profiles.findIndex((item) => item.profileId === profile.profileId);
    if (index >= 0) {
      profiles[index] = profile;
      return;
    }
    profiles.push(profile);
  });
  return {
    saveSpy,
    repository: {
      async list() {
        return profiles;
      },
      async get(profileId: string) {
        return profiles.find((profile) => profile.profileId === profileId);
      },
      save: saveSpy,
      async delete() {},
    },
  };
}

function createSecretStorage(secrets: Record<string, string> = {}): SecretStorageAdapter {
  const store = new Map(Object.entries(secrets));
  return {
    async getSecret(key: string) {
      return store.get(key);
    },
    async setSecret(key: string, value: string) {
      store.set(key, value);
    },
    async deleteSecret(key: string) {
      store.delete(key);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('profile endpoint commands', () => {
  it('measures draft endpoints and returns per-endpoint statuses with runtime resolution in auto mode', async () => {
    _resetForTesting();
    setSecretStorageAdapter(createSecretStorage());
    setProviderProfileRepository(createProfileRepository().repository);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://fast.example.com/')) {
        return new Response(JSON.stringify({ object: 'list', data: [{ id: 'gpt-image-2' }, { id: 'gpt-4.1' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: { message: 'Unavailable' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await measureProfileEndpoints({
      providerId: 'image-endpoint',
      displayName: 'Draft Endpoint',
      config: {
        family: 'image-endpoint',
        connection: {
          selectionMode: 'auto',
          endpoints: [
            { id: 'fast', url: 'https://fast.example.com', enabled: true },
            { id: 'slow', url: 'https://slow.example.com', enabled: true },
          ],
        },
      },
      secretValues: { apiKey: 'test-key' },
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.results).toHaveLength(2);
    expect(result.value.results[0]).toMatchObject({ endpointId: 'fast', status: 'success', modelCount: 1 });
    expect(result.value.results[0]?.models?.map((model) => model.id)).toEqual(['gpt-image-2']);
    expect(result.value.models?.map((model) => model.id)).toEqual(['gpt-image-2']);
    expect(result.value.results[1]).toMatchObject({ endpointId: 'slow', status: 'failed' });
    expect(result.value.resolvedEndpointId).toBe('fast');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns unsupported when the provider does not expose endpoint measurement', async () => {
    _resetForTesting();
    setSecretStorageAdapter(createSecretStorage());
    setProviderProfileRepository(createProfileRepository().repository);

    const result = await measureProfileEndpoints({
      providerId: 'mock',
      displayName: 'Mock',
      config: {
        family: 'image-endpoint',
        connection: {
          selectionMode: 'auto',
          endpoints: [{ id: 'mock-endpoint', url: 'https://mock.local', enabled: true }],
        },
      },
      secretValues: { apiKey: 'test-key' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.supported).toBe(false);
    expect(result.value.results).toEqual([]);
    expect(result.value.resolvedEndpointId).toBeUndefined();
  });

  it('does not mutate persisted models cache while measuring an existing profile', async () => {
    _resetForTesting();
    const profile: ProviderProfile = {
      profileId: 'profile-a',
      providerId: 'image-endpoint',
      displayName: 'Saved Endpoint',
      enabled: true,
      config: {
        providerId: 'image-endpoint',
        displayName: 'Saved Endpoint',
        family: 'image-endpoint',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'saved',
          endpoints: [{ id: 'saved', url: 'https://saved.example.com', enabled: true }],
        },
      },
      secretRefs: { apiKey: 'secret:profile-a:apiKey' },
      models: [{ id: 'cached-model' }],
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    };
    const { repository, saveSpy } = createProfileRepository([profile]);
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(createSecretStorage({ 'secret:profile-a:apiKey': 'test-key' }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ object: 'list', data: [{ id: 'gpt-image-2' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await measureProfileEndpoints({
      profileId: 'profile-a',
      providerId: 'image-endpoint',
      config: {
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'saved',
          endpoints: [{ id: 'saved', url: 'https://saved.example.com', enabled: true }],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(profile.models).toEqual([{ id: 'cached-model' }]);
    if (result.ok) {
      expect(result.value.models?.map((model) => model.id)).toEqual(['gpt-image-2']);
    }
  });

  it('excludes explicitly removed saved secrets from draft measurement resolution', async () => {
    _resetForTesting();
    const profile: ProviderProfile = {
      profileId: 'profile-a',
      providerId: 'image-endpoint',
      displayName: 'Saved Endpoint',
      enabled: true,
      config: {
        providerId: 'image-endpoint',
        displayName: 'Saved Endpoint',
        family: 'image-endpoint',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'saved',
          endpoints: [{ id: 'saved', url: 'https://saved.example.com', enabled: true }],
        },
      },
      secretRefs: { apiKey: 'secret:profile-a:apiKey' },
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    };
    setProviderProfileRepository(createProfileRepository([profile]).repository);
    setSecretStorageAdapter(createSecretStorage({ 'secret:profile-a:apiKey': 'test-key' }));

    const result = await measureProfileEndpoints({
      profileId: 'profile-a',
      providerId: 'image-endpoint',
      removedSecretNames: ['apiKey'],
      config: {
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'saved',
          endpoints: [{ id: 'saved', url: 'https://saved.example.com', enabled: true }],
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('apiKey');
    }
  });

  it('keeps manual mode measurements from inventing an auto resolution', async () => {
    _resetForTesting();
    setSecretStorageAdapter(createSecretStorage());
    setProviderProfileRepository(createProfileRepository().repository);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ object: 'list', data: [{ id: 'gpt-image-2' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await measureProfileEndpoints({
      providerId: 'image-endpoint',
      displayName: 'Manual Endpoint',
      config: {
        family: 'image-endpoint',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://manual.example.com', enabled: true }],
        },
      },
      secretValues: { apiKey: 'test-key' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.results[0]).toMatchObject({ endpointId: 'primary', status: 'success' });
    expect(result.value.resolvedEndpointId).toBeUndefined();
  });
});

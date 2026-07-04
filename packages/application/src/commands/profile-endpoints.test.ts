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
      if (url.startsWith('https://fast.example.com')) {
        return new Response(null, { status: 200 });
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(null, { status: 503 });
    });

    const result = await measureProfileEndpoints({
      apiFormat: 'openai-images',
      displayName: 'Draft Endpoint',
      config: {        connection: {
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
    expect(result.value.results[0]).toMatchObject({ endpointId: 'fast', status: 'success', httpStatus: 200 });
    expect(result.value.results[1]).toMatchObject({ endpointId: 'slow', status: 'success', httpStatus: 503 });
    expect(result.value.resolvedEndpointId).toBe('fast');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: 'HEAD' });
    expect((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers).toBeUndefined();
  });

  it('measures Gemini draft endpoints through the shared reachability probe', async () => {
    _resetForTesting();
    setSecretStorageAdapter(createSecretStorage());
    setProviderProfileRepository(createProfileRepository().repository);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    const result = await measureProfileEndpoints({
      apiFormat: 'gemini-generate-content',
      displayName: 'Gemini',
      config: {        connection: {
          selectionMode: 'auto',
          endpoints: [{ id: 'gemini-endpoint', url: 'https://gemini.local/v1beta', enabled: true }],
        },
      },
      secretValues: { apiKey: 'test-key' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.supported).toBe(true);
    expect(result.value.results).toMatchObject([
      { endpointId: 'gemini-endpoint', status: 'success', httpStatus: 204 },
    ]);
    expect(result.value.resolvedEndpointId).toBe('gemini-endpoint');
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://gemini.local/v1beta');
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: 'HEAD' });
  });

  it('does not mutate persisted models cache while measuring an existing profile', async () => {
    _resetForTesting();
    const profile: ProviderProfile = {
      profileId: 'profile-a',
      apiFormat: 'openai-images',
      displayName: 'Saved Endpoint',
      enabled: true,
      config: {
        apiFormat: 'openai-images',
        displayName: 'Saved Endpoint',        connection: {
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const result = await measureProfileEndpoints({
      profileId: 'profile-a',
      apiFormat: 'openai-images',
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
  });

  it('excludes explicitly removed saved secrets from draft measurement resolution', async () => {
    _resetForTesting();
    const profile: ProviderProfile = {
      profileId: 'profile-a',
      apiFormat: 'openai-images',
      displayName: 'Saved Endpoint',
      enabled: true,
      config: {
        apiFormat: 'openai-images',
        displayName: 'Saved Endpoint',        connection: {
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
      apiFormat: 'openai-images',
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const result = await measureProfileEndpoints({
      apiFormat: 'openai-images',
      displayName: 'Manual Endpoint',
      config: {        connection: {
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

  it('reports network errors as unreachable without inventing provider semantics', async () => {
    _resetForTesting();
    setSecretStorageAdapter(createSecretStorage());
    setProviderProfileRepository(createProfileRepository().repository);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await measureProfileEndpoints({
      apiFormat: 'openai-images',
      displayName: 'Broken Endpoint',
      config: {
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://broken.example.com', enabled: true }],
        },
      },
      secretValues: { apiKey: 'test-key' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results[0]).toMatchObject({
        endpointId: 'primary',
        status: 'failed',
        failureKind: 'connect',
      });
    }
  });
});

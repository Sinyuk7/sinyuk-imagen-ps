import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshProfileBalance } from './profile-billing.js';
import { saveProviderProfile } from './provider-profiles.js';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  getProviderConfigResolver,
  setProviderConfigResolver,
  setProviderProfileRepository,
  setSecretStorageAdapter,
} from '../runtime.js';
import type {
  ProviderConfigResolver,
  ProviderProfile,
  ProviderProfileRepository,
  SecretStorageAdapter,
} from './types.js';

function createProfileRepository(initialProfiles: readonly ProviderProfile[]): ProviderProfileRepository & {
  readonly saved: ProviderProfile[];
} {
  const store = new Map(initialProfiles.map((profile) => [profile.profileId, profile]));
  const saved: ProviderProfile[] = [];
  return {
    saved,
    async list() {
      return Array.from(store.values());
    },
    async get(profileId) {
      return store.get(profileId);
    },
    async save(profile) {
      store.set(profile.profileId, profile);
      saved.push(profile);
    },
    async delete(profileId) {
      store.delete(profileId);
    },
  };
}

function createSecretStorage(initialValues?: Readonly<Record<string, string>>): SecretStorageAdapter & {
  readonly values: Map<string, string>;
} {
  const values = new Map(Object.entries(initialValues ?? {}));
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

function createProviderProfile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    profileId: 'profile-relay',
    apiFormat: 'openai-chat-completions',
    displayName: 'Relay',
    enabled: true,
    config: {
      apiFormat: 'openai-chat-completions',
      displayName: 'Relay',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{
          id: 'primary',
          url: 'https://relay.test/v1',
          enabled: true,
        }],
      },
      paths: {
        invoke: '/chat/completions',
      },
    },
    selectedModelIds: [],
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

function installProviderRuntime(args?: {
  readonly validateConfig?: (input: unknown) => unknown;
  readonly queryBalance?: (config: unknown, input: { readonly signal?: AbortSignal }) => Promise<unknown>;
}): void {
  _setRuntimeInstanceForTesting({
    providerRegistry: {
      list: () => [],
      get: () => undefined,
      getByApiFormat: () => ({
        id: 'chat-image',
        family: 'chat-image',
        describe: () => ({
          id: 'chat-image',
          family: 'chat-image',
          displayName: 'Chat Image',
          operations: ['text_to_image'],
          invokeMode: 'sync',
          billing: { query: 'supported' },
        }),
        validateConfig: args?.validateConfig ?? ((input: unknown) => input),
        validateRequest: (input: unknown) => input,
        invoke: async () => ({ assets: [] }),
        ...(args?.queryBalance ? { queryBalance: args.queryBalance } : {}),
      }),
    },
  } as never);
}

describe('profile billing commands', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('saves billing-token config with billingToken secret refs', async () => {
    const repository = createProfileRepository([]);
    const secrets = createSecretStorage();
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(secrets);
    installProviderRuntime();

    const result = await saveProviderProfile({
      profileId: 'profile-relay',
      apiFormat: 'openai-chat-completions',
      displayName: 'Relay',
      config: {
        apiFormat: 'openai-chat-completions',
        displayName: 'Relay',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{
            id: 'primary',
            url: 'https://relay.test/v1',
            enabled: true,
          }],
        },
        paths: {
          invoke: '/chat/completions',
        },
        billing: {
          source: 'billing-token',
          path: '/client/openapi/getCredits',
          tokenSecretRef: 'secret:pending:billingToken',
        },
      },
      secretValues: {
        billingToken: 'billing-token-123',
      },
      selectedModelIds: [],
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.secretRefs : undefined).toEqual({
      billingToken: 'secret:provider-profile:profile-relay:billingToken',
    });
    expect(repository.saved[0]?.config.billing).toEqual({
      source: 'billing-token',
      path: '/client/openapi/getCredits',
      tokenSecretRef: 'secret:provider-profile:profile-relay:billingToken',
    });
    expect(secrets.values.get('secret:provider-profile:profile-relay:billingToken')).toBe('billing-token-123');
  });

  it('resolves billing-token secret into runtime billing config', async () => {
    const repository = createProfileRepository([createProviderProfile({
      secretRefs: {
        billingToken: 'secret:provider-profile:profile-relay:billingToken',
      },
      config: {
        apiFormat: 'openai-chat-completions',
        displayName: 'Relay',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{
            id: 'primary',
            url: 'https://relay.test/v1',
            enabled: true,
          }],
        },
        paths: {
          invoke: '/chat/completions',
        },
        billing: {
          source: 'billing-token',
          path: '/client/openapi/getCredits',
          tokenSecretRef: 'secret:provider-profile:profile-relay:billingToken',
        },
      },
    })]);
    const secrets = createSecretStorage({
      'secret:provider-profile:profile-relay:billingToken': 'billing-token-456',
    });
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(secrets);
    installProviderRuntime();

    const resolved = await getProviderConfigResolver().resolve('profile-relay');

    expect(resolved.providerConfig).toMatchObject({
      billing: {
        source: 'billing-token',
        path: '/client/openapi/getCredits',
        tokenSecretRef: 'billing-token-456',
      },
    });
  });

  it('persists successful protocol hint and keeps balance cache when only hint changes', async () => {
    const repository = createProfileRepository([createProviderProfile({
      secretRefs: {
        apiKey: 'secret:provider-profile:profile-relay:apiKey',
      },
      config: {
        apiFormat: 'openai-chat-completions',
        displayName: 'Relay',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{
            id: 'primary',
            url: 'https://relay.test/v1',
            enabled: true,
          }],
        },
        paths: {
          invoke: '/chat/completions',
        },
        billing: {
          source: 'profile-api-key',
          path: '/client/openapi/getAPIKeyCredits',
        },
      },
    })]);
    setProviderProfileRepository(repository);
    setProviderConfigResolver({
      async resolve(profileId) {
        return {
          profileId,
          apiFormat: 'openai-chat-completions',
          implementationId: 'chat-image',
          providerConfig: {
            providerId: 'chat-image',
            family: 'chat-image',
            displayName: 'Relay',
            apiFormat: 'openai-chat-completions',
            connection: {
              selectionMode: 'manual',
              selectedEndpointId: 'primary',
              endpoints: [{
                id: 'primary',
                url: 'https://relay.test/v1',
                enabled: true,
              }],
            },
            paths: {
              invoke: '/chat/completions',
            },
            billing: {
              source: 'profile-api-key',
              path: '/client/openapi/getAPIKeyCredits',
            },
            apiKey: 'sk-live',
          },
        };
      },
    } satisfies ProviderConfigResolver);
    installProviderRuntime({
      queryBalance: vi.fn()
        .mockResolvedValueOnce({
          protocolId: 'credits-api-key-json-v1',
          snapshot: {
            primary: {
              kind: 'money',
              remaining: '10',
              currency: 'USD',
            },
          },
        })
        .mockResolvedValueOnce({
          protocolId: 'credits-api-key-json-v1',
          snapshot: {
            primary: {
              kind: 'money',
              remaining: '9',
              currency: 'USD',
            },
          },
        }),
    });

    const first = await refreshProfileBalance({ profileId: 'profile-relay' });
    expect(first.ok).toBe(true);
    const savedAfterFirst = repository.saved.at(-1);
    expect(savedAfterFirst?.config.billing).toEqual({
      source: 'profile-api-key',
      path: '/client/openapi/getAPIKeyCredits',
      lastSuccessfulProtocolId: 'credits-api-key-json-v1',
    });
    expect(savedAfterFirst?.updatedAt).toBe(
      new Date(first.ok ? first.value.checkedAt : 0).toISOString(),
    );

    const second = await refreshProfileBalance({ profileId: 'profile-relay' });
    expect(second.ok).toBe(true);
    expect(second.ok ? second.value.state.lastBalanceChange : undefined).toEqual({
      amount: '1',
      unit: 'USD',
      direction: 'decreased',
    });
  });

  it('detects quota balance changes when billing protocol returns credits-style snapshots', async () => {
    const repository = createProfileRepository([createProviderProfile({
      secretRefs: {
        apiKey: 'secret:provider-profile:profile-relay:apiKey',
      },
      config: {
        apiFormat: 'openai-chat-completions',
        displayName: 'Relay',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{
            id: 'primary',
            url: 'https://relay.test/v1',
            enabled: true,
          }],
        },
        paths: {
          invoke: '/chat/completions',
        },
        billing: {
          source: 'profile-api-key',
          path: '/client/openapi/getCredits',
        },
      },
    })]);
    setProviderProfileRepository(repository);
    setProviderConfigResolver({
      async resolve(profileId) {
        return {
          profileId,
          apiFormat: 'openai-chat-completions',
          implementationId: 'chat-image',
          providerConfig: {
            providerId: 'chat-image',
            family: 'chat-image',
            displayName: 'Relay',
            apiFormat: 'openai-chat-completions',
            connection: {
              selectionMode: 'manual',
              selectedEndpointId: 'primary',
              endpoints: [{
                id: 'primary',
                url: 'https://relay.test/v1',
                enabled: true,
              }],
            },
            paths: {
              invoke: '/chat/completions',
            },
            billing: {
              source: 'profile-api-key',
              path: '/client/openapi/getCredits',
            },
            apiKey: 'sk-live',
          },
        };
      },
    } satisfies ProviderConfigResolver);
    installProviderRuntime({
      queryBalance: vi.fn()
        .mockResolvedValueOnce({
          protocolId: 'credits-api-key-json-v1',
          snapshot: {
            primary: {
              kind: 'quota',
              remaining: '10',
              unit: 'credits',
            },
          },
        })
        .mockResolvedValueOnce({
          protocolId: 'credits-api-key-json-v1',
          snapshot: {
            primary: {
              kind: 'quota',
              remaining: '8',
              unit: 'credits',
            },
          },
        }),
    });

    const first = await refreshProfileBalance({ profileId: 'profile-relay' });
    expect(first.ok).toBe(true);

    const second = await refreshProfileBalance({ profileId: 'profile-relay' });
    expect(second.ok).toBe(true);
    expect(second.ok ? second.value.state.lastBalanceChange : undefined).toEqual({
      amount: '2',
      unit: 'credits',
      direction: 'decreased',
    });
  });
});

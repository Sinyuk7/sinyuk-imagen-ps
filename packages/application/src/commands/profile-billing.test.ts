import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderRegistry, type Provider, type ProviderBalanceSnapshot, type ProviderConfig, type ProviderRequest } from '@imagen-ps/providers';
import { _resetForTesting, _setRuntimeInstanceForTesting, setProviderProfileRepository, setSecretStorageAdapter } from '../runtime.js';
import {
  _profileBillingStateCountsForTesting,
  _resetProfileBillingStateForTesting,
  getProfileBillingState,
  invalidateProfileBillingState,
  refreshProfileBalance,
  scheduleProfileBalanceRefresh,
} from './profile-billing.js';
import type { ProviderProfile, ProviderProfileRepository, SecretStorageAdapter } from './types.js';

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

function createSecretStorage(secrets: Record<string, string>): SecretStorageAdapter {
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

function billingProfile(): ProviderProfile {
  return {
    profileId: 'billing-profile',
    providerId: 'billing-mock',
    displayName: 'Billing Mock',
    enabled: true,
    config: {
      providerId: 'billing-mock',
      displayName: 'Billing Mock',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        failoverEnabled: false,
        preferredEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://example.com', enabled: true }],
      },
      billing: {
        mode: 'new-api',
        userId: '10001',
        accessTokenSecretRef: 'resolved-token',
      },
    },
    createdAt: '2026-07-03T00:00:00.000Z',
    updatedAt: '2026-07-03T00:00:00.000Z',
  };
}

function balanceSnapshot(): ProviderBalanceSnapshot {
  return {
    primary: {
      kind: 'quota',
      remaining: '42',
      unit: 'quota',
    },
  };
}

function setBillingProvider(queryBalance: Provider<ProviderConfig, ProviderRequest>['queryBalance']): void {
  const registry = createProviderRegistry();
  const provider: Provider<ProviderConfig, ProviderRequest> = {
    id: 'billing-mock',
    family: 'image-endpoint',
    describe() {
      return {
        id: 'billing-mock',
        family: 'image-endpoint',
        displayName: 'Billing Mock',
        operations: ['text_to_image'],
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
      throw new Error('invoke not used in billing tests');
    },
    async queryBalance(config, input) {
      return queryBalance!(config, input);
    },
  };
  registry.register(provider);
  _setRuntimeInstanceForTesting({ providerRegistry: registry } as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  _resetProfileBillingStateForTesting();
});

describe('profile billing commands', () => {
  it('enters a local cooldown after a 429 balance failure', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([billingProfile()]));
    setSecretStorageAdapter(createSecretStorage({ 'resolved-token': 'billing-token' }));
    const queryBalance = vi.fn(async () => {
      throw Object.assign(
        new Error('Billing query failed with HTTP 429: {"message":"您多次使用无效令牌，请等待 120 秒后再试","success":false}'),
        { statusCode: 429 },
      );
    });
    setBillingProvider(queryBalance);

    const first = await refreshProfileBalance({ profileId: 'billing-profile' });
    const second = await refreshProfileBalance({ profileId: 'billing-profile' });

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(queryBalance).toHaveBeenCalledTimes(1);
    if (!second.ok) {
      expect(second.error.message).toContain('cooling down after a 429 response');
      expect(second.error.details).toMatchObject({
        cooldownReason: 'rate-limit',
      });
      expect(typeof second.error.details?.retryAfterMs).toBe('number');
    }

    const state = await getProfileBillingState('billing-profile');
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.value.refreshState).toBe('error');
    }
  });

  it('enters a local cooldown after repeated auth failures', async () => {
    _resetForTesting();
    setProviderProfileRepository(createRepository([billingProfile()]));
    setSecretStorageAdapter(createSecretStorage({ 'resolved-token': 'billing-token' }));
    const queryBalance = vi.fn(async () => {
      throw new Error('无权进行此操作，access token 无效');
    });
    setBillingProvider(queryBalance);

    const first = await refreshProfileBalance({ profileId: 'billing-profile' });
    const second = await refreshProfileBalance({ profileId: 'billing-profile' });
    const third = await refreshProfileBalance({ profileId: 'billing-profile' });
    const fourth = await refreshProfileBalance({ profileId: 'billing-profile' });

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(third.ok).toBe(false);
    expect(fourth.ok).toBe(false);
    expect(queryBalance).toHaveBeenCalledTimes(3);
    if (!fourth.ok) {
      expect(fourth.error.message).toContain('cooling down after repeated auth failures');
      expect(fourth.error.details).toMatchObject({
        cooldownReason: 'auth-fail',
      });
    }
  });

  it('clears cooldown after it expires and a later refresh succeeds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-03T00:00:00.000Z'));
    _resetForTesting();
    setProviderProfileRepository(createRepository([billingProfile()]));
    setSecretStorageAdapter(createSecretStorage({ 'resolved-token': 'billing-token' }));

    const queryBalance = vi.fn(async () => {
      if (queryBalance.mock.calls.length === 1) {
        throw Object.assign(
          new Error('Billing query failed with HTTP 429: {"message":"您多次使用无效令牌，请等待 120 秒后再试","success":false}'),
          { statusCode: 429 },
        );
      }
      return balanceSnapshot();
    });
    setBillingProvider(queryBalance);

    const first = await refreshProfileBalance({ profileId: 'billing-profile' });
    const blocked = await refreshProfileBalance({ profileId: 'billing-profile' });
    vi.setSystemTime(new Date('2026-07-03T00:02:01.000Z'));
    const recovered = await refreshProfileBalance({ profileId: 'billing-profile' });

    expect(first.ok).toBe(false);
    expect(blocked.ok).toBe(false);
    expect(recovered.ok).toBe(true);
    expect(queryBalance).toHaveBeenCalledTimes(2);
    if (recovered.ok) {
      expect(recovered.value.state.refreshState).toBe('idle');
      expect(recovered.value.snapshot.primary).toMatchObject({ kind: 'quota', remaining: '42' });
    }
  });

  it('invalidateProfileBillingState clears cached state and scheduled refresh timers', async () => {
    vi.useFakeTimers();
    _resetForTesting();
    setProviderProfileRepository(createRepository([billingProfile()]));
    setSecretStorageAdapter(createSecretStorage({ 'resolved-token': 'billing-token' }));
    setBillingProvider(async () => balanceSnapshot());

    await refreshProfileBalance({ profileId: 'billing-profile' });
    await scheduleProfileBalanceRefresh('billing-profile', { delayMs: 5_000 });

    expect(_profileBillingStateCountsForTesting()).toMatchObject({
      billingStateEntries: 1,
      scheduledRefreshEntries: 1,
    });

    invalidateProfileBillingState('billing-profile');

    expect(_profileBillingStateCountsForTesting()).toMatchObject({
      billingStateEntries: 0,
      scheduledRefreshEntries: 0,
      inflightRefreshEntries: 0,
      inflightRefreshProfiles: 0,
      billingCooldownEntries: 0,
    });
  });
});

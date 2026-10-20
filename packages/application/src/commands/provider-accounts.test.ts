import { beforeEach, describe, expect, it } from 'vitest';
import { _resetForTesting, getProviderAccountRepository, getSecretStorageAdapter } from '../runtime.js';
import { listProviderAccounts, saveProviderAccount } from './provider-accounts.js';

describe('provider accounts', () => {
  beforeEach(() => _resetForTesting());
  it('upserts one account per fixed provider', async () => {
    await saveProviderAccount({ providerId: 'grsai', displayName: 'GRSAI', secretRef: 'secret:grsai' });
    await saveProviderAccount({ providerId: 'grsai', displayName: 'GRSAI updated', secretRef: 'secret:grsai-2' });
    const result = await listProviderAccounts();
    expect(result.ok && result.value).toHaveLength(1);
    expect((await getProviderAccountRepository().get('grsai'))?.secretRef).toBe('secret:grsai-2');
  });

  it('stores the optional GRSAI billing token separately and preserves it on later saves', async () => {
    await saveProviderAccount({ providerId: 'grsai', displayName: 'GRSAI', apiKey: 'api-key', billingToken: 'billing-token' });
    const account = await getProviderAccountRepository().get('grsai');
    expect(account?.billingTokenSecretRef).toBe('secret:provider-account:grsai:billingToken');
    expect(JSON.stringify(account)).not.toContain('billing-token');
    expect(await getSecretStorageAdapter().getSecret(account!.billingTokenSecretRef!)).toBe('billing-token');

    await saveProviderAccount({ providerId: 'grsai', displayName: 'GRSAI', apiKey: 'new-api-key' });
    expect((await getProviderAccountRepository().get('grsai'))?.billingTokenSecretRef).toBe(account?.billingTokenSecretRef);
  });

  it('rejects billing tokens for RunningHub', async () => {
    const result = await saveProviderAccount({ providerId: 'runninghub', displayName: 'RunningHub', apiKey: 'api-key', billingToken: 'not-supported' });
    expect(result.ok).toBe(false);
    expect(await getProviderAccountRepository().get('runninghub')).toBeUndefined();
  });
});

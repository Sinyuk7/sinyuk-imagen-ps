import { beforeEach, describe, expect, it } from 'vitest';
import { _resetForTesting, getProviderAccountRepository } from '../runtime.js';
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
});

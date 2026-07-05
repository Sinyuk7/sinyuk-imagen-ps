import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../../../src/providers/mock/provider.js';
import { parseNewApiBalanceResponse } from '../../../src/transport/billing/query-balance.js';

describe('provider billing query contract', () => {
  it('parses new-api quota response without forcing currency conversion', () => {
    expect(parseNewApiBalanceResponse({
      success: true,
      data: {
        quota: 500000,
        used_quota: 120000,
      },
    })).toEqual({
      primary: {
        kind: 'quota',
        remaining: '500000',
        unit: 'quota',
      },
      details: [{
        kind: 'quota',
        label: 'Used quota',
        value: '120000',
        unit: 'quota',
      }],
    });
  });

  it('keeps mock billing isolated from connectivity capability', async () => {
    const provider = createMockProvider();
    await expect(provider.queryBalance?.()).resolves.toEqual({
      primary: {
        kind: 'money',
        remaining: '12.50',
        currency: 'USD',
      },
    });
    expect(provider.describe().billing).toEqual({
      supportedModes: ['none'],
    });
  });
});

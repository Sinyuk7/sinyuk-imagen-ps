import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeBillingProtocolChain } from '../src/transport/billing/protocol-registry.js';
import {
  parseCreditsBalanceResponse,
  parseNewApiBalanceResponse,
} from '../src/transport/billing/query-balance.js';

function createFetchResponse(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as Response;
}

describe('billing protocol registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses credits balance responses into quota snapshots', () => {
    expect(parseCreditsBalanceResponse({
      code: 0,
      data: {
        credits: 10000,
      },
      msg: 'success',
    })).toEqual({
      primary: {
        kind: 'quota',
        remaining: '10000',
        unit: 'credits',
      },
    });
  });

  it('parses new-api balance responses into quota snapshots with used details', () => {
    expect(parseNewApiBalanceResponse({
      success: true,
      data: {
        quota: '256.5',
        used_quota: 12,
      },
    })).toEqual({
      primary: {
        kind: 'quota',
        remaining: '256.5',
        unit: 'quota',
      },
      details: [{
        kind: 'quota',
        label: 'Used quota',
        value: '12',
        unit: 'quota',
      }],
    });
  });

  it('uses persisted protocol hint first and stops after first success', async () => {
    const calls: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return createFetchResponse(200, {
        success: true,
        data: {
          quota: '88',
          used_quota: '11',
        },
      });
    }) as typeof fetch);

    const result = await executeBillingProtocolChain({
      endpointUrl: 'https://relay.test/v1',
      billing: {
        source: 'billing-token',
        path: '/balance',
        tokenSecretRef: 'billing-token',
        userId: 'user-1001',
        lastSuccessfulProtocolId: 'new-api-user-bearer-v1',
      },
    });

    expect(result.protocolId).toBe('new-api-user-bearer-v1');
    expect(result.snapshot.primary).toEqual({
      kind: 'quota',
      remaining: '88',
      unit: 'quota',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: 'https://relay.test/balance',
      init: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer billing-token',
          'New-Api-User': 'user-1001',
        },
      },
    });
  });

  it('falls back to later candidate protocol and reports only final success', async () => {
    const calls: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return createFetchResponse(404, 'not found');
      }
      return createFetchResponse(200, {
        success: true,
        quota: '42',
        used_quota: '8',
      });
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const result = await executeBillingProtocolChain({
      endpointUrl: 'https://relay.test/v1',
      billing: {
        source: 'billing-token',
        path: '/balance',
        tokenSecretRef: 'billing-token',
        userId: 'user-2002',
      },
    });

    expect(result).toMatchObject({
      protocolId: 'new-api-user-bearer-v1',
      snapshot: {
        primary: {
          kind: 'quota',
          remaining: '42',
          unit: 'quota',
        },
      },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      url: 'https://relay.test/balance',
      init: {
        method: 'POST',
        body: JSON.stringify({ token: 'billing-token' }),
        headers: { 'Content-Type': 'application/json' },
      },
    });
    expect(calls[1]).toMatchObject({
      url: 'https://relay.test/balance',
      init: {
        method: 'GET',
        headers: {
          Authorization: 'Bearer billing-token',
          'New-Api-User': 'user-2002',
        },
      },
    });
  });

  it('aggregates candidate failures when all protocols fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createFetchResponse(401, 'unauthorized')) as typeof fetch);

    await expect(executeBillingProtocolChain({
      endpointUrl: 'https://relay.test/v1',
      billing: {
        source: 'billing-token',
        path: '/balance',
        tokenSecretRef: 'billing-token',
        userId: 'user-3003',
      },
    })).rejects.toThrow(
      'Billing query failed for all candidate protocols. credits-token-json-v1: Billing query failed with HTTP 401: unauthorized | new-api-user-bearer-v1: Billing query failed with HTTP 401: unauthorized',
    );
  });
});

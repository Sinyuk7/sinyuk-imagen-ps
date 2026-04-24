import { describe, expect, it } from 'vitest';

import { createProviderDispatcher, dispatchProvider } from './dispatch.js';
import { createProviderError } from './errors.js';

describe('createProviderDispatcher', () => {
  it('routes calls to the matching adapter', async () => {
    const dispatcher = createProviderDispatcher([
      {
        provider: 'mock',
        async dispatch(params) {
          return {
            echoedPrompt: params.prompt,
          };
        },
      },
    ]);

    await expect(
      dispatchProvider(dispatcher, {
        provider: 'mock',
        params: { prompt: 'hello' },
      }),
    ).resolves.toEqual({
      echoedPrompt: 'hello',
    });
  });

  it('fails when provider adapter is missing', async () => {
    const dispatcher = createProviderDispatcher();

    await expect(
      dispatchProvider(dispatcher, {
        provider: 'missing',
        params: {},
      }),
    ).rejects.toMatchObject({
      category: 'provider',
    });
  });

  it('preserves JobError thrown by an adapter', async () => {
    const error = createProviderError('mock failed', { provider: 'mock' });
    const dispatcher = createProviderDispatcher([
      {
        provider: 'mock',
        async dispatch() {
          throw error;
        },
      },
    ]);

    await expect(
      dispatchProvider(dispatcher, {
        provider: 'mock',
        params: {},
      }),
    ).rejects.toBe(error);
  });

  it('maps generic Error to JobError with provider category', async () => {
    const dispatcher = createProviderDispatcher([
      {
        provider: 'mock',
        async dispatch() {
          const err = new Error('network timeout');
          err.name = 'NetworkError';
          throw err;
        },
      },
    ]);

    await expect(
      dispatchProvider(dispatcher, {
        provider: 'mock',
        params: {},
      }),
    ).rejects.toMatchObject({
      category: 'provider',
      message: 'network timeout',
      details: { provider: 'mock', name: 'NetworkError' },
    });
  });

  it('rejects empty provider in ProviderRef', async () => {
    const dispatcher = createProviderDispatcher([
      {
        provider: 'mock',
        async dispatch() {
          return 'ok';
        },
      },
    ]);

    await expect(
      dispatchProvider(dispatcher, {
        provider: '  ',
        params: {},
      }),
    ).rejects.toMatchObject({
      category: 'validation',
    });
  });

  it('rejects non-serializable params', async () => {
    const dispatcher = createProviderDispatcher([
      {
        provider: 'mock',
        async dispatch() {
          return 'ok';
        },
      },
    ]);

    await expect(
      dispatchProvider(dispatcher, {
        provider: 'mock',
        params: { fn: () => {} } as unknown as Record<string, unknown>,
      }),
    ).rejects.toMatchObject({
      category: 'validation',
    });
  });

  it('rejects non-serializable result from adapter', async () => {
    const dispatcher = createProviderDispatcher([
      {
        provider: 'mock',
        async dispatch() {
          return { fn: () => {} };
        },
      },
    ]);

    await expect(
      dispatchProvider(dispatcher, {
        provider: 'mock',
        params: {},
      }),
    ).rejects.toMatchObject({
      category: 'validation',
    });
  });

  it('rejects duplicate adapter registration', () => {
    expect(() =>
      createProviderDispatcher([
        { provider: 'mock', async dispatch() { return 'a'; } },
        { provider: 'mock', async dispatch() { return 'b'; } },
      ]),
    ).toThrow(/already registered/);
  });

  it('rejects empty provider in adapter registration', () => {
    expect(() =>
      createProviderDispatcher([
        { provider: '  ', async dispatch() { return 'ok'; } },
      ]),
    ).toThrow(/must not be empty/);
  });

  it('returns deep-frozen result snapshots', async () => {
    const dispatcher = createProviderDispatcher([
      {
        provider: 'mock',
        async dispatch() {
          return {
            nested: {
              value: 42,
            },
            arr: [1, 2, { deep: true }],
          };
        },
      },
    ]);

    const result = await dispatchProvider(dispatcher, {
      provider: 'mock',
      params: {},
    }) as Record<string, unknown>;

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nested)).toBe(true);
    expect(Object.isFrozen(result.arr)).toBe(true);
    expect(Object.isFrozen((result.arr as unknown[])[2])).toBe(true);
  });
});

describe('dispatchProvider', () => {
  it('delegates to dispatcher.dispatch', async () => {
    const dispatcher = createProviderDispatcher([
      {
        provider: 'mock',
        async dispatch(params) {
          return { ok: params.ok };
        },
      },
    ]);

    const result = await dispatchProvider(dispatcher, {
      provider: 'mock',
      params: { ok: true },
    });

    expect(result).toEqual({ ok: true });
  });
});

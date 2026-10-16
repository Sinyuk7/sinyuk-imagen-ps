import { describe, expect, it } from 'vitest';
import { createStaleConfigStore } from './stale-config.js';

describe('stale config store', () => {
  it('returns cached data immediately and writes remote data for the next load', async () => {
    let cached = { version: '10-15' };
    const store = createStaleConfigStore({
      cache: { read: () => cached, write: (value) => { cached = value; } },
      fallback: { version: 'default' },
      fetchRemote: async () => ({ version: '10-16' }),
    });
    expect(store.loadSnapshot()).toEqual({ value: { version: '10-15' }, source: 'cache' });
    await store.refreshInBackground();
    expect(store.loadSnapshot()).toEqual({ value: { version: '10-16' }, source: 'cache' });
  });
});

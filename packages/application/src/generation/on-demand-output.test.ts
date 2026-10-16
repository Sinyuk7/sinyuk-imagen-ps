import { describe, expect, it } from 'vitest';
import { resolveOutputOnDemand } from './on-demand-output.js';

describe('on-demand output materialization', () => {
  it('uses local asset before download or query', async () => {
    const ref = { kind: 'inline' as const, ref: 'asset-1' };
    const result = await resolveOutputOnDemand({} as never, { outputId: 'o', index: 0, url: '', observedAt: new Date().toISOString(), assetRef: ref }, { download: { download: async () => { throw new Error('unexpected'); } }, query: { query: async () => { throw new Error('unexpected'); } } });
    expect(result).toEqual(ref);
  });
});

import { describe, expect, it } from 'vitest';
import { getProviderCatalog, listFixedProviders } from '../src/catalog.js';

describe('fixed provider catalogs', () => {
  it('exposes only the fixed providers and valid defaults', () => {
    expect(listFixedProviders()).toEqual(['grsai', 'runninghub']);
    for (const providerId of listFixedProviders()) {
      const catalog = getProviderCatalog(providerId);
      expect(catalog.models.length).toBeGreaterThan(0);
      expect(catalog.models.some((model) => model.id === catalog.defaultModel)).toBe(true);
      for (const model of catalog.models) {
        for (const parameter of Object.values(model.parameters)) {
          expect(parameter.options.some((option) => option.value === parameter.default)).toBe(true);
        }
      }
    }
  });

  it('keeps provider-specific parameter shapes in the catalog', () => {
    const grsai = getProviderCatalog('grsai');
    const runninghub = getProviderCatalog('runninghub');
    expect(Object.keys(grsai.models[0]?.parameters ?? {})).toContain('aspectRatio');
    expect(runninghub.models[0]?.endpoint).toMatch(/^\/openapi\//);
  });
});

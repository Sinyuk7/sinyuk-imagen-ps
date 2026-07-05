import { describe, expect, it } from 'vitest';
import {
  hasExplicitImageModelRule,
  listLocalCatalogModels,
  resolveImageModelRule,
  validateImageModelCatalog,
} from './../src/contract/image-model-capability.js';
import type { ImageCatalogProviderId, ModelBrand } from './../src/contract/image-model-capability.js';

const EXPECTED: ReadonlyArray<{
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly ruleId: string;
  readonly brand: ModelBrand;
}> = [
  { providerId: 'image-endpoint', modelId: 'gpt-image-2', ruleId: 'image-endpoint-gpt-image-2', brand: 'openai' },
  { providerId: 'chat-image', modelId: 'google/gemini-2.5-flash-image-preview', ruleId: 'chat-image-gemini-flash-image-preview', brand: 'google-gemini' },
  { providerId: 'chat-image', modelId: 'gemini-3-pro-image', ruleId: 'chat-image-gemini-3-pro-image', brand: 'google-gemini' },
  { providerId: 'chat-image', modelId: 'gemini-3.1-flash-image', ruleId: 'chat-image-gemini-3.1-flash-image', brand: 'google-gemini' },
  { providerId: 'chat-image', modelId: 'openai/gpt-image-2', ruleId: 'chat-image-openai-gpt-image-2', brand: 'openai' },
  { providerId: 'gemini-generate-content', modelId: 'gemini-3.1-flash-image', ruleId: 'gemini-generate-content-gemini-3.1-flash-image', brand: 'google-gemini' },
  { providerId: 'gemini-generate-content', modelId: 'gemini-3-pro-image', ruleId: 'gemini-generate-content-gemini-3-pro-image', brand: 'google-gemini' },
  { providerId: 'gemini-generate-content', modelId: 'gemini-3.1-flash-lite-image', ruleId: 'gemini-generate-content-gemini-3.1-flash-lite-image', brand: 'google-gemini' },
];

describe('image model catalog brand coverage', () => {
  it('keeps the catalog internally consistent including brand presence', () => {
    expect(validateImageModelCatalog()).toEqual([]);
  });

  it.each(EXPECTED)(
    'assigns brand $brand to rule $ruleId',
    ({ providerId, modelId, ruleId, brand }) => {
      const resolved = resolveImageModelRule({ providerId, modelId });
      expect(resolved.ruleId).toBe(ruleId);
      expect(resolved.capability.brand).toBe(brand);
    },
  );

  it('fails closed for unknown models instead of returning fallback default rules', () => {
    for (const providerId of ['image-endpoint', 'chat-image', 'gemini-generate-content'] as const) {
      expect(hasExplicitImageModelRule({ providerId, modelId: 'unknown-custom-model' })).toBe(false);
      expect(() => resolveImageModelRule({ providerId, modelId: 'unknown-custom-model' })).toThrow(/no explicit rule/);
    }
  });

  it('keeps executable catalog free of default and 512-specific output concepts', () => {
    for (const model of listLocalCatalogModels()) {
      expect(model.ruleId.endsWith('-default')).toBe(false);
      for (const matrix of model.outputMatrix ?? []) {
        expect(matrix.imageSizes.map((option) => option.id)).not.toContain('512');
        for (const cell of matrix.cells) {
          expect(cell.imageSize).not.toBe('512');
          expect(JSON.stringify(cell.requestOutput)).not.toContain('IMAGE_SIZE_FIVE_TWELVE');
        }
      }
    }
  });
});

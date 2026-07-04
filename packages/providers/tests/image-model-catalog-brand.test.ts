import { describe, expect, it } from 'vitest';
import {
  listLocalCatalogModels,
  resolveImageModelRule,
  validateImageModelCatalog,
} from '../src/contract/image-model-capability.js';
import type { ImageCatalogProviderId, ModelBrand } from '../src/contract/image-model-capability.js';

const EXPECTED: ReadonlyArray<{
  readonly providerId: ImageCatalogProviderId;
  readonly ruleId: string;
  readonly brand: ModelBrand;
}> = [
  { providerId: 'image-endpoint', ruleId: 'image-endpoint-gpt-image-2', brand: 'openai' },
  { providerId: 'image-endpoint', ruleId: 'image-endpoint-gpt-image-1', brand: 'openai' },
  { providerId: 'image-endpoint', ruleId: 'image-endpoint-dall-e-3', brand: 'openai' },
  { providerId: 'image-endpoint', ruleId: 'image-endpoint-grok-imagine-image-pro', brand: 'xai' },
  { providerId: 'image-endpoint', ruleId: 'image-endpoint-grok-imagine-image', brand: 'xai' },
  { providerId: 'image-endpoint', ruleId: 'image-endpoint-doubao-seedream-5-0-260128', brand: 'doubao' },
  { providerId: 'image-endpoint', ruleId: 'image-endpoint-qwen-image-2.0-2026-03-03', brand: 'qwen' },
  { providerId: 'chat-image', ruleId: 'chat-image-gemini-flash-image-preview', brand: 'google-gemini' },
  { providerId: 'chat-image', ruleId: 'chat-image-gemini-3-pro-image', brand: 'google-gemini' },
  { providerId: 'chat-image', ruleId: 'chat-image-gemini-3.1-flash-image', brand: 'google-gemini' },
  { providerId: 'chat-image', ruleId: 'chat-image-openai-gpt-image-2', brand: 'openai' },
  { providerId: 'gemini-generate-content', ruleId: 'gemini-generate-content-gemini-3.1-flash-image', brand: 'google-gemini' },
  { providerId: 'gemini-generate-content', ruleId: 'gemini-generate-content-gemini-3-pro-image', brand: 'google-gemini' },
  { providerId: 'gemini-generate-content', ruleId: 'gemini-generate-content-gemini-3.1-flash-lite-image', brand: 'google-gemini' },
];

function modelIdForRule(providerId: ImageCatalogProviderId, ruleId: string): string {
  const models = listLocalCatalogModels(providerId);
  const model = models.find((entry) => entry.ruleId === ruleId);
  if (!model) {
    throw new Error(`rule ${ruleId} is not picker-visible in ${providerId}`);
  }
  return model.id;
}

describe('image model catalog brand coverage', () => {
  it('keeps the catalog internally consistent including brand presence', () => {
    expect(validateImageModelCatalog()).toEqual([]);
  });

  it.each(EXPECTED)(
    'assigns brand $brand to rule $ruleId',
    ({ providerId, ruleId, brand }) => {
      const modelId = modelIdForRule(providerId, ruleId);
      const resolved = resolveImageModelRule({ providerId, modelId });
      expect(resolved.ruleId).toBe(ruleId);
      expect(resolved.capability.brand).toBe(brand);
    },
  );

  it('leaves fallback default rules without a brand', () => {
    const imageEndpointFallback = resolveImageModelRule({
      providerId: 'image-endpoint',
      modelId: 'unknown-custom-model',
    });
    expect(imageEndpointFallback.matchKind).toBe('default');
    expect(imageEndpointFallback.capability.brand).toBeUndefined();

    const chatImageFallback = resolveImageModelRule({
      providerId: 'chat-image',
      modelId: 'unknown-custom-model',
    });
    expect(chatImageFallback.matchKind).toBe('default');
    expect(chatImageFallback.capability.brand).toBeUndefined();

    const geminiFallback = resolveImageModelRule({
      providerId: 'gemini-generate-content',
      modelId: 'unknown-custom-model',
    });
    expect(geminiFallback.matchKind).toBe('default');
    expect(geminiFallback.capability.brand).toBeUndefined();
  });
});

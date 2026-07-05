import { describe, expect, it } from 'vitest';
import {
  resolveImageModelRule,
  validateImageModelCatalog,
} from '../src/contract/image-model-capability.js';
import type { ImageCatalogProviderId, ModelBrand } from '../src/contract/image-model-capability.js';

const EXPECTED: ReadonlyArray<{
  readonly providerId: ImageCatalogProviderId;
  readonly modelId: string;
  readonly ruleId: string;
  readonly brand: ModelBrand;
}> = [
  { providerId: 'image-endpoint', modelId: 'gpt-image-2', ruleId: 'image-endpoint-gpt-image-2', brand: 'openai' },
  { providerId: 'image-endpoint', modelId: 'gpt-image-1', ruleId: 'image-endpoint-gpt-image-1', brand: 'openai' },
  { providerId: 'image-endpoint', modelId: 'dall-e-3', ruleId: 'image-endpoint-dall-e-3', brand: 'openai' },
  { providerId: 'image-endpoint', modelId: 'grok-imagine-image-pro', ruleId: 'image-endpoint-grok-imagine-image-pro', brand: 'xai' },
  { providerId: 'image-endpoint', modelId: 'grok-imagine-image', ruleId: 'image-endpoint-grok-imagine-image', brand: 'xai' },
  { providerId: 'image-endpoint', modelId: 'doubao-seedream-5-0-260128', ruleId: 'image-endpoint-doubao-seedream-5-0-260128', brand: 'doubao' },
  { providerId: 'image-endpoint', modelId: 'qwen-image-2.0-2026-03-03', ruleId: 'image-endpoint-qwen-image-2.0-2026-03-03', brand: 'qwen' },
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

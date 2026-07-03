import { describe, expect, it } from 'vitest';
import { resolveModelBrand } from './resolve-model-brand.js';

describe('resolveModelBrand', () => {
  it('returns the catalog brand for image-endpoint curated models', () => {
    expect(resolveModelBrand({ providerId: 'image-endpoint', modelId: 'gpt-image-1' })).toBe('openai');
    expect(resolveModelBrand({ providerId: 'image-endpoint', modelId: 'dall-e-3' })).toBe('openai');
    expect(resolveModelBrand({ providerId: 'image-endpoint', modelId: 'grok-imagine-image' })).toBe('xai');
    expect(resolveModelBrand({ providerId: 'image-endpoint', modelId: 'doubao-seedream-5-0-260128' })).toBe('doubao');
    expect(resolveModelBrand({ providerId: 'image-endpoint', modelId: 'qwen-image-2.0-2026-03-03' })).toBe('qwen');
  });

  it('returns the catalog brand for chat-image curated models', () => {
    expect(resolveModelBrand({ providerId: 'chat-image', modelId: 'gemini-3-pro-image' })).toBe('google-gemini');
    expect(resolveModelBrand({ providerId: 'chat-image', modelId: 'openai/gpt-image-2' })).toBe('openai');
  });

  it('returns undefined for unknown models that hit the fallback rule', () => {
    expect(resolveModelBrand({ providerId: 'image-endpoint', modelId: 'some-custom-model' })).toBeUndefined();
    expect(resolveModelBrand({ providerId: 'chat-image', modelId: 'some-custom-model' })).toBeUndefined();
  });

  it('returns undefined for non-catalog providers', () => {
    expect(resolveModelBrand({ providerId: 'mock', modelId: 'mock-image-v1' })).toBeUndefined();
    expect(resolveModelBrand({ providerId: 'prompt-optimize', modelId: 'gpt-4o-mini' })).toBeUndefined();
    expect(resolveModelBrand({ providerId: 'unknown-provider', modelId: 'gpt-image-1' })).toBeUndefined();
  });
});

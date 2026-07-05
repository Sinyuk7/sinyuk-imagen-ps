import { describe, expect, it } from 'vitest';
import { resolveModelBrand } from './resolve-model-brand.js';

describe('resolveModelBrand', () => {
  it('returns the catalog brand for image-endpoint curated models', () => {
    expect(resolveModelBrand({ apiFormat: 'openai-images', modelId: 'gpt-image-2' })).toBe('openai');
    expect(resolveModelBrand({ apiFormat: 'openai-images', modelId: 'chatgpt-image-latest' })).toBe('openai');
  });

  it('returns the catalog brand for chat-image curated models', () => {
    expect(resolveModelBrand({ apiFormat: 'openai-chat-completions', modelId: 'gemini-3-pro-image' })).toBe('google-gemini');
    expect(resolveModelBrand({ apiFormat: 'openai-chat-completions', modelId: 'openai/gpt-image-2' })).toBe('openai');
  });

  it('returns the catalog brand for gemini-generate-content curated models', () => {
    expect(resolveModelBrand({ apiFormat: 'gemini-generate-content', modelId: 'gemini-3.1-flash-image' })).toBe('google-gemini');
    expect(resolveModelBrand({ apiFormat: 'gemini-generate-content', modelId: 'gemini-3.1-flash-lite-image' })).toBe('google-gemini');
  });

  it('returns undefined for unknown or removed models', () => {
    expect(resolveModelBrand({ apiFormat: 'openai-images', modelId: 'some-custom-model' })).toBeUndefined();
    expect(resolveModelBrand({ apiFormat: 'openai-images', modelId: 'gpt-image-1' })).toBeUndefined();
    expect(resolveModelBrand({ apiFormat: 'openai-images', modelId: 'dall-e-3' })).toBeUndefined();
    expect(resolveModelBrand({ apiFormat: 'openai-images', modelId: 'grok-imagine-image' })).toBeUndefined();
    expect(resolveModelBrand({ apiFormat: 'openai-chat-completions', modelId: 'some-custom-model' })).toBeUndefined();
    expect(resolveModelBrand({ apiFormat: 'gemini-generate-content', modelId: 'some-custom-model' })).toBeUndefined();
  });
});

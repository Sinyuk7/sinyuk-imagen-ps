import { describe, expect, it } from 'vitest';
import {
  builtins,
  type BuiltinProviderId,
  chatImageDescriptor,
  createChatImageProvider,
  createGeminiGenerateContentProvider,
  createImageEndpointProvider,
  createMockProvider,
  createPromptOptimizeProvider,
  createProviderRegistry,
  listLocalCatalogModels,
  imageEndpointDescriptor,
  geminiGenerateContentDescriptor,
  providerUsesImageModelCatalog,
  promptOptimizeDescriptor,
  registerBuiltins,
} from '../src/index.js';
import type { ProviderFamily } from '../src/index.js';

describe('provider registry and exports', () => {
  it('exports the builtin provider factories and descriptors', () => {
    expect(createImageEndpointProvider().id).toBe('image-endpoint');
    expect(createChatImageProvider().id).toBe('chat-image');
    expect(createGeminiGenerateContentProvider().id).toBe('gemini-generate-content');
    expect(createMockProvider().id).toBe('mock');
    expect(createPromptOptimizeProvider().id).toBe('prompt-optimize');
    expect(imageEndpointDescriptor.id).toBe('image-endpoint');
    expect(chatImageDescriptor.id).toBe('chat-image');
    expect(geminiGenerateContentDescriptor.id).toBe('gemini-generate-content');
    expect(promptOptimizeDescriptor.id).toBe('prompt-optimize');
  });

  it('registers mock, image-endpoint, chat-image, gemini-generate-content, and prompt-optimize builtins', () => {
    const registry = createProviderRegistry();

    registerBuiltins(registry);

    expect(registry.list().map((provider) => provider.id)).toEqual([
      'mock',
      'image-endpoint',
      'chat-image',
      'gemini-generate-content',
      'prompt-optimize',
    ]);
  });

  it('keeps builtin provider ids exhaustive across factories and public exports', () => {
    const builtinIds: readonly BuiltinProviderId[] = [
      'image-endpoint',
      'chat-image',
      'gemini-generate-content',
      'prompt-optimize',
    ];

    expect(Object.keys(builtins)).toEqual(builtinIds);
    expect(builtins['image-endpoint']().id).toBe(createImageEndpointProvider().id);
    expect(builtins['chat-image']().id).toBe(createChatImageProvider().id);
    expect(builtins['gemini-generate-content']().id).toBe(createGeminiGenerateContentProvider().id);
    expect(builtins['prompt-optimize']().id).toBe(createPromptOptimizeProvider().id);
  });

  it('keeps provider-family coverage independent from builtin ids', () => {
    const descriptors = [
      imageEndpointDescriptor,
      chatImageDescriptor,
      geminiGenerateContentDescriptor,
      promptOptimizeDescriptor,
    ];
    const families = new Set(descriptors.map((descriptor) => descriptor.family));
    const expectedFamilies: readonly ProviderFamily[] = [
      'image-endpoint',
      'chat-image',
      'gemini-generate-content',
      'prompt-optimize',
    ];

    expect([...families].sort()).toEqual([...expectedFamilies].sort());
  });

  it('keeps catalog-capable provider ids separate from non-catalog builtins', () => {
    const catalogProviders = [
      createImageEndpointProvider(),
      createChatImageProvider(),
      createGeminiGenerateContentProvider(),
      createPromptOptimizeProvider(),
    ].filter((provider) => providerUsesImageModelCatalog(provider.id));

    expect(catalogProviders.map((provider) => provider.id)).toEqual([
      'image-endpoint',
      'chat-image',
      'gemini-generate-content',
    ]);
    expect(listLocalCatalogModels('image-endpoint').length).toBeGreaterThan(0);
    expect(listLocalCatalogModels('chat-image').length).toBeGreaterThan(0);
    expect(listLocalCatalogModels('gemini-generate-content').length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  chatImageDescriptor,
  createChatImageProvider,
  createImageEndpointProvider,
  createMockProvider,
  createPromptOptimizeProvider,
  createProviderRegistry,
  imageEndpointDescriptor,
  promptOptimizeDescriptor,
  registerBuiltins,
} from '../src/index.js';

describe('provider registry and exports', () => {
  it('exports the builtin provider factories and descriptors', () => {
    expect(createImageEndpointProvider().id).toBe('image-endpoint');
    expect(createChatImageProvider().id).toBe('chat-image');
    expect(createMockProvider().id).toBe('mock');
    expect(createPromptOptimizeProvider().id).toBe('prompt-optimize');
    expect(imageEndpointDescriptor.id).toBe('image-endpoint');
    expect(chatImageDescriptor.id).toBe('chat-image');
    expect(promptOptimizeDescriptor.id).toBe('prompt-optimize');
  });

  it('registers mock, image-endpoint, chat-image, and prompt-optimize builtins', () => {
    const registry = createProviderRegistry();

    registerBuiltins(registry);

    expect(registry.list().map((provider) => provider.id)).toEqual([
      'mock',
      'image-endpoint',
      'chat-image',
      'prompt-optimize',
    ]);
  });
});

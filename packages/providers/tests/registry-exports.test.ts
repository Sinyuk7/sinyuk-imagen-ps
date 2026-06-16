import { describe, expect, it } from 'vitest';
import {
  chatImageDescriptor,
  createChatImageProvider,
  createImageEndpointProvider,
  createMockProvider,
  createProviderRegistry,
  imageEndpointDescriptor,
  registerBuiltins,
} from '../src/index.js';

describe('provider registry and exports', () => {
  it('exports the builtin provider factories and descriptors', () => {
    expect(createImageEndpointProvider().id).toBe('image-endpoint');
    expect(createChatImageProvider().id).toBe('chat-image');
    expect(createMockProvider().id).toBe('mock');
    expect(imageEndpointDescriptor.id).toBe('image-endpoint');
    expect(chatImageDescriptor.id).toBe('chat-image');
  });

  it('registers mock, image-endpoint, and chat-image builtins', () => {
    const registry = createProviderRegistry();

    registerBuiltins(registry);

    expect(registry.list().map((provider) => provider.id)).toEqual(['mock', 'image-endpoint', 'chat-image']);
  });
});

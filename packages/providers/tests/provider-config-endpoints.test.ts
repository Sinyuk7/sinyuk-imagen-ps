import { describe, expect, it } from 'vitest';
import {
  createChatImageProvider,
  createGeminiGenerateContentProvider,
  createImageEndpointProvider,
  createPromptOptimizeProvider,
} from '../src/index.js';

describe('provider endpoint config canonicalization', () => {
  it('accepts canonical connection config and normalizes endpoint urls', () => {
    const provider = createImageEndpointProvider();
    const config = provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{
          id: 'primary',
          url: 'https://API.EXAMPLE.COM/',
          enabled: true,
        }],
      },
      apiKey: 'test-key',
    });

    expect(config.connection).toEqual({
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [{
        id: 'primary',
        url: 'https://api.example.com/',
        enabled: true,
      }],
    });
  });

  it('rejects missing canonical connection', () => {
    const provider = createImageEndpointProvider();
    expect(() => provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      apiKey: 'test-key',
    })).toThrow('connection');
  });

  it('accepts multi-endpoint config and preserves endpoint order', () => {
    const provider = createChatImageProvider();
    const config = provider.validateConfig({
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image',
      connection: {
        selectionMode: 'auto',
        endpoints: [
          { id: 'a', url: 'https://api.example.com/v1', enabled: true },
          { id: 'b', url: 'https://api.example.com/anthropic', enabled: false },
        ],
      },
      apiKey: 'test-key',
    });

    expect(config.connection.endpoints.map((endpoint) => endpoint.id)).toEqual(['a', 'b']);
  });

  it('rejects duplicate endpoint ids', () => {
    const provider = createImageEndpointProvider();
    expect(() => provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'a',
        endpoints: [
          { id: 'a', url: 'https://api-a.example.com/', enabled: true },
          { id: 'a', url: 'https://api-b.example.com/', enabled: true },
        ],
      },
      apiKey: 'test-key',
    })).toThrow('duplicate endpoint id');
  });

  it('rejects duplicate canonical endpoint urls', () => {
    const provider = createImageEndpointProvider();
    expect(() => provider.validateConfig({
      providerId: 'image-endpoint',
      displayName: 'Image Endpoint',
      family: 'image-endpoint',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'a',
        endpoints: [
          { id: 'a', url: 'https://api.example.com/', enabled: true },
          { id: 'b', url: 'https://API.EXAMPLE.COM', enabled: true },
        ],
      },
      apiKey: 'test-key',
    })).toThrow('duplicate endpoint URL');
  });

  it('rejects invalid selected endpoint in manual mode', () => {
    const provider = createPromptOptimizeProvider();
    expect(() => provider.validateConfig({
      providerId: 'prompt-optimize',
      displayName: 'Prompt Optimizer',
      family: 'prompt-optimize',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'missing',
        endpoints: [{ id: 'a', url: 'https://openrouter.ai/api/v1', enabled: true }],
      },
      apiKey: 'test-key',
      instruction: 'Rewrite.',
    })).toThrow('selectedEndpointId');
  });

  it('rejects manual mode without enabled selected endpoint', () => {
    const provider = createPromptOptimizeProvider();
    expect(() => provider.validateConfig({
      providerId: 'prompt-optimize',
      displayName: 'Prompt Optimizer',
      family: 'prompt-optimize',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'a',
        endpoints: [
          { id: 'a', url: 'https://openrouter.ai/api/v1', enabled: false },
          { id: 'b', url: 'https://openrouter.ai/api/anthropic', enabled: true },
        ],
      },
      apiKey: 'test-key',
      instruction: 'Rewrite.',
    })).toThrow('selectedEndpointId');
  });

  it('keeps canonical connection idempotent across repeated validation', () => {
    const provider = createChatImageProvider();
    const input = {
      providerId: 'chat-image',
      displayName: 'Chat Image',
      family: 'chat-image' as const,
      connection: {
        selectionMode: 'manual' as const,
        selectedEndpointId: 'primary',
        endpoints: [
          { id: 'primary', url: 'https://openrouter.ai/api/v1/', enabled: true },
          { id: 'backup', url: 'https://openrouter.ai/api/anthropic/', enabled: false },
        ],
      },
      apiKey: 'test-key',
    };

    const first = provider.validateConfig(input);
    const second = provider.validateConfig(first);

    expect(second).toEqual(first);
  });

  it('accepts Gemini Generate Content config with explicit auth/api-version ownership', () => {
    const provider = createGeminiGenerateContentProvider();
    const config = provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.n1n.ai/gateway', enabled: true }],
      },
      apiKey: 'test-key',
      authMode: 'bearer',
      apiVersion: 'v1beta',
    });

    expect(config.authMode).toBe('bearer');
    expect(config.apiVersion).toBe('v1beta');
    expect(config.connection.endpoints[0]?.url).toBe('https://api.n1n.ai/gateway');
  });

  it('rejects Gemini Generate Content endpoints that already encode the API version or auth header', () => {
    const provider = createGeminiGenerateContentProvider();

    expect(() => provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.n1n.ai/v1beta', enabled: true }],
      },
      apiKey: 'test-key',
      authMode: 'bearer',
      apiVersion: 'v1beta',
    })).toThrow('versionless');

    expect(() => provider.validateConfig({
      providerId: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      family: 'gemini-generate-content',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://api.n1n.ai', enabled: true }],
      },
      apiKey: 'test-key',
      extraHeaders: { 'x-goog-api-key': 'override' },
    })).toThrow('provider-owned');
  });
});

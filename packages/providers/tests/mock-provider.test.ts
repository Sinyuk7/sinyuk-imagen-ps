import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../src/providers/mock/provider.js';
import type { MockProviderConfig } from '../src/providers/mock/config-schema.js';
import type { MockProviderRequest } from '../src/providers/mock/request-schema.js';

function makeConfig(overrides: Partial<MockProviderConfig> = {}): MockProviderConfig {
  return {
    providerId: 'mock',
    displayName: 'Mock Provider',
    family: 'openai-compatible',
    baseURL: 'https://mock.local',
    apiKey: 'mock-key',
    delayMs: 0,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<MockProviderRequest> = {}): MockProviderRequest {
  return {
    operation: 'generate',
    prompt: 'test prompt',
    ...overrides,
  };
}

describe('mock provider model selection', () => {
  it('uses explicit providerOptions.model over config.defaultModel', async () => {
    const provider = createMockProvider();
    const config = makeConfig({ defaultModel: 'config-default' });
    const request = makeRequest({ providerOptions: { model: 'custom-model' } });

    const result = await provider.invoke({ config, request, signal: undefined });

    expect((result.raw as Record<string, unknown>).model).toBe('custom-model');
  });

  it('falls back to config.defaultModel when providerOptions.model is absent', async () => {
    const provider = createMockProvider();
    const config = makeConfig({ defaultModel: 'config-default' });
    const request = makeRequest();

    const result = await provider.invoke({ config, request, signal: undefined });

    expect((result.raw as Record<string, unknown>).model).toBe('config-default');
  });

  it('falls back to hardcoded default when both providerOptions.model and config.defaultModel are absent', async () => {
    const provider = createMockProvider();
    const config = makeConfig(); // no defaultModel
    const request = makeRequest(); // no providerOptions

    const result = await provider.invoke({ config, request, signal: undefined });

    expect((result.raw as Record<string, unknown>).model).toBe('mock-image-v1');
  });

  it('falls back to hardcoded default when providerOptions exists but model is absent', async () => {
    const provider = createMockProvider();
    const config = makeConfig(); // no defaultModel
    const request = makeRequest({ providerOptions: { otherOption: 'value' } });

    const result = await provider.invoke({ config, request, signal: undefined });

    expect((result.raw as Record<string, unknown>).model).toBe('mock-image-v1');
  });

  it('includes model in raw alongside other required fields', async () => {
    const provider = createMockProvider();
    const config = makeConfig({ defaultModel: 'test-model' });
    const request = makeRequest();

    const result = await provider.invoke({ config, request, signal: undefined });

    expect(result.raw).toMatchObject({
      mock: true,
      operation: 'generate',
      prompt: 'test prompt',
      assetCount: 1,
      model: 'test-model',
    });
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].type).toBe('image');
  });
});

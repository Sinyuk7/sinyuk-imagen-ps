/**
 * Provider model discovery contract 测试。
 *
 * INTENT: 锁定 mock 声明 `defaultModels`、未声明 `discoverModels`，并验证
 * `defaultModels` / `discoverModels` 两个 OPTIONAL 字段在不同 implementation 上
 * 的独立性（互不要求）。
 */
import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../src/providers/mock/provider.js';
import { mockDescriptor } from '../src/providers/mock/descriptor.js';
import type { Provider, ProviderDescriptor, ProviderModelInfo } from '../src/contract/index.js';

describe('mock provider model discovery contract', () => {
  it('declares defaultModels with mock-image-v1', () => {
    const provider = createMockProvider();
    const descriptor = provider.describe();
    expect(descriptor.defaultModels).toEqual([{ id: 'mock-image-v1' }]);
  });

  it('exposes the same defaultModels via the exported descriptor constant', () => {
    expect(mockDescriptor.defaultModels).toEqual([{ id: 'mock-image-v1' }]);
  });

  it('does NOT implement discoverModels', () => {
    const provider = createMockProvider();
    expect(provider.discoverModels).toBeUndefined();
  });
});

describe('ProviderDescriptor optional fields are independent', () => {
  const sampleModels: readonly ProviderModelInfo[] = [{ id: 'foo' }, { id: 'bar', displayName: 'Bar' }];

  it('descriptor MAY declare defaultModels without exposing discoverModels', () => {
    const descriptor: ProviderDescriptor = {
      id: 'fake-static-only',
      family: 'openai-compatible',
      displayName: 'Fake static-only',
      capabilities: {
        imageGenerate: true,
        imageEdit: false,
        multiImageInput: false,
        transparentBackground: false,
        customSize: false,
        aspectRatio: false,
        syncInvoke: true,
      },
      operations: ['generate'],
      defaultModels: sampleModels,
    };
    expect(descriptor.defaultModels).toEqual(sampleModels);
  });

  it('descriptor MAY omit defaultModels (treated as no implementation fallback)', () => {
    const descriptor: ProviderDescriptor = {
      id: 'fake-empty',
      family: 'openai-compatible',
      displayName: 'Fake empty',
      capabilities: {
        imageGenerate: true,
        imageEdit: false,
        multiImageInput: false,
        transparentBackground: false,
        customSize: false,
        aspectRatio: false,
        syncInvoke: true,
      },
      operations: ['generate'],
    };
    expect(descriptor.defaultModels).toBeUndefined();
  });

  it('provider MAY implement discoverModels independently of defaultModels', async () => {
    const provider: Provider = {
      id: 'fake-discovery-only',
      family: 'openai-compatible',
      describe(): ProviderDescriptor {
        return {
          id: 'fake-discovery-only',
          family: 'openai-compatible',
          displayName: 'Fake discovery-only',
          capabilities: {
            imageGenerate: true,
            imageEdit: false,
            multiImageInput: false,
            transparentBackground: false,
            customSize: false,
            aspectRatio: false,
            syncInvoke: true,
          },
          operations: ['generate'],
          // intentionally no defaultModels
        };
      },
      validateConfig(input) {
        return input as never;
      },
      validateRequest(input) {
        return input as never;
      },
      async invoke() {
        return { assets: [] };
      },
      async discoverModels() {
        return sampleModels;
      },
    };

    const descriptor = provider.describe();
    expect(descriptor.defaultModels).toBeUndefined();
    expect(provider.discoverModels).toBeDefined();
    const result = await provider.discoverModels!({} as never);
    expect(result).toEqual(sampleModels);
  });

  it('provider MAY declare both defaultModels and discoverModels', () => {
    const descriptor: ProviderDescriptor = {
      id: 'fake-both',
      family: 'openai-compatible',
      displayName: 'Fake both',
      capabilities: {
        imageGenerate: true,
        imageEdit: false,
        multiImageInput: false,
        transparentBackground: false,
        customSize: false,
        aspectRatio: false,
        syncInvoke: true,
      },
      operations: ['generate'],
      defaultModels: sampleModels,
    };
    const provider: Provider = {
      id: 'fake-both',
      family: 'openai-compatible',
      describe() {
        return descriptor;
      },
      validateConfig(input) {
        return input as never;
      },
      validateRequest(input) {
        return input as never;
      },
      async invoke() {
        return { assets: [] };
      },
      async discoverModels() {
        return sampleModels;
      },
    };
    expect(provider.describe().defaultModels).toEqual(sampleModels);
    expect(provider.discoverModels).toBeDefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  createImageEndpointProvider,
  createProviderRegistry,
  geminiGenerateContentDescriptor,
  getOfficialModelPreset,
  grsaiGenerateDescriptor,
  imageEndpointDescriptor,
  registerBuiltins,
  type Provider,
  type ProviderConfig,
  type ProviderRequest,
} from '../../src/index.js';

describe('Provider default model templates', () => {
  it('uses complete local templates that exactly resolve to Official Model Presets', () => {
    for (const descriptor of [imageEndpointDescriptor, geminiGenerateContentDescriptor, grsaiGenerateDescriptor]) {
      for (const template of descriptor.defaultModelTemplates) {
        const preset = getOfficialModelPreset(template.apiFormat, template.baseModelId);
        expect(template.modelId).not.toHaveLength(0);
        expect(template.wireModelId).not.toHaveLength(0);
        expect(preset?.requestStrategyId).toBeTruthy();
      }
    }
  });

  it('freezes builtin model inventories', () => {
    expect(grsaiGenerateDescriptor.defaultModelTemplates).toHaveLength(12);
    expect(geminiGenerateContentDescriptor.defaultModelTemplates.map((template) => template.modelId)).toEqual([
      'gemini-3.1-flash-image',
      'gemini-3-pro-image',
      'gemini-3.1-flash-lite-image',
    ]);
    expect(geminiGenerateContentDescriptor.defaultModelTemplates.map((template) => template.modelId))
      .not.toContain('nano-banana-fast');
    expect(imageEndpointDescriptor.defaultModelTemplates.map((template) => template.modelId)).toEqual(['gpt-image-2']);
  });

  it('permits different wire ids to reuse one exact base preset', () => {
    const base = imageEndpointDescriptor.defaultModelTemplates[0]!;
    const variants = [
      { ...base, modelId: 'model-a', wireModelId: 'wire-a' },
      { ...base, modelId: 'model-b', wireModelId: 'wire-b' },
    ];
    expect(new Set(variants.map((template) => template.baseModelId))).toEqual(new Set([base.baseModelId]));
    expect(variants.map((template) => getOfficialModelPreset(template.apiFormat, template.baseModelId)?.requestStrategyId))
      .toEqual([getOfficialModelPreset(base.apiFormat, base.baseModelId)?.requestStrategyId, getOfficialModelPreset(base.apiFormat, base.baseModelId)?.requestStrategyId]);
  });

  it('uses only canonical ApiFormat routing and rejects conflicting registrations', () => {
    const registry = createProviderRegistry();
    registry.register(createImageEndpointProvider());
    expect(registry.getByApiFormat('openai-images')?.id).toBe('image-endpoint');
    expect(() => registry.register(createImageEndpointProvider())).toThrow(/already registered/);

    const nonCanonical = {
      ...createImageEndpointProvider(),
      id: 'not-image-endpoint',
    } as Provider<ProviderConfig, ProviderRequest>;
    const invalid = createProviderRegistry();
    expect(() => invalid.register(nonCanonical)).toThrow(/not canonical/);

    const invalidTemplate = {
      ...createImageEndpointProvider(),
      describe: () => ({
        ...imageEndpointDescriptor,
        defaultModelTemplates: [{
          apiFormat: 'openai-images' as const,
          modelId: 'broken-template',
          wireModelId: 'broken-template',
          baseModelId: 'not-an-official-preset',
        }],
      }),
    } as Provider<ProviderConfig, ProviderRequest>;
    expect(() => createProviderRegistry().register(invalidTemplate)).toThrow(/does not resolve exactly/);
  });

  it('registers builtins with mock excluded from ApiFormat routing', () => {
    const registry = createProviderRegistry();
    registerBuiltins(registry);
    expect(registry.getByApiFormat('openai-images')?.id).toBe('image-endpoint');
  });
});

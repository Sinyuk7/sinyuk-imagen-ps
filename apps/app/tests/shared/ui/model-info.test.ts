import { describe, expect, it } from 'vitest';
import type { UserModelConfig } from '@imagen-ps/application';
import {
  capabilityPresetLabel,
  configurationInstanceLabel,
  modelConfigListPresentation,
  userConfiguredModelLabel,
} from '../../../src/shared/ui/model-info';

const nanoBananaPresetNames = new Map([
  ['gemini-3.1-flash-lite-image', 'Nano Banana 2 Lite'],
]);

function userConfig(overrides: Partial<UserModelConfig> = {}): UserModelConfig {
  return {
    apiFormat: 'gemini-generate-content',
    modelId: 'nano-banana-fast',
    baseModelId: 'gemini-3.1-flash-lite-image',
    wireModelId: 'nano-banana-fast',
    requestStrategyId: 'gemini-generate-content-image-config',
    outputExposure: {
      kind: 'flexible-pixels',
      sizePresetIds: ['auto', '1k'],
      outputFormats: ['png'],
      allowInputDerivedExactSize: false,
    },
    outputMatrix: [],
    ...overrides,
  };
}

describe('model-info presentation helpers', () => {
  it('uses saved config modelId for configuration-instance labels', () => {
    expect(configurationInstanceLabel({
      id: 'nano-banana-fast',
      displayName: 'Nano Banana 2 Lite',
      wireModelId: 'gpt-image-2-vip',
      configSource: 'user',
    })).toBe('nano-banana-fast');
  });

  it('keeps friendly preset label for catalog-only entries', () => {
    expect(configurationInstanceLabel({
      id: 'gemini-3.1-flash-lite-image',
      displayName: 'Nano Banana 2 Lite',
      wireModelId: 'models/gemini-3.1-flash-lite-image',
      configSource: 'catalog',
    })).toBe('Nano Banana 2 Lite');
    expect(capabilityPresetLabel({
      id: 'gemini-3.1-flash-lite-image',
      wireModelId: 'models/gemini-3.1-flash-lite-image',
    })).toBe('models/gemini-3.1-flash-lite-image');
  });

  it('keeps same-preset configs distinguishable in model config list presentation', () => {
    expect(modelConfigListPresentation(
      userConfig({ modelId: 'nano-banana-fast' }),
      nanoBananaPresetNames,
    )).toEqual({
      title: 'Nano Banana 2 Lite',
      metaPrimary: 'nano-banana-fast',
    });
    expect(modelConfigListPresentation(
      userConfig({ modelId: 'nano-banana-2-lite' }),
      nanoBananaPresetNames,
    )).toEqual({
      title: 'Nano Banana 2 Lite',
      metaPrimary: 'nano-banana-2-lite',
    });
  });

  it('falls back conservatively when official preset label is missing', () => {
    expect(modelConfigListPresentation(
      userConfig({
        baseModelId: 'gpt-image-2',
        wireModelId: 'gpt-image-2-vip',
      }),
    )).toEqual({
      title: 'gpt-image-2',
      metaPrimary: 'nano-banana-fast',
    });
    expect(modelConfigListPresentation(
      userConfig({
        baseModelId: '',
        wireModelId: 'gpt-image-2-vip',
      }),
    )).toEqual({
      title: 'gpt-image-2-vip',
      metaPrimary: 'nano-banana-fast',
    });
  });

  it('uses saved config modelId for user-configured selector labels', () => {
    expect(userConfiguredModelLabel(userConfig({
      modelId: 'gpt-image-2-vip',
      wireModelId: 'gpt-image-2',
    }))).toBe('gpt-image-2-vip');
  });
});

import { describe, expect, it } from 'vitest';
import { deriveComposerReadiness, modelSupportsImageInput, modelSupportsOperation } from '../src/shared/ui/composer-readiness';
import { fixedProviderModels } from '../src/shared/ui/model-info';

describe('composer model operation support', () => {
  it('retains operation declarations from the fixed provider catalog projection', () => {
    const models = fixedProviderModels('grsai');
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(modelSupportsOperation(model, 'text-to-image')).toBe('supported');
      expect(modelSupportsImageInput(model)).toBe('supported');
    }
  });

  it('uses catalog operations when available and keeps missing evidence unknown', () => {
    const textOnlyModel = { id: 'text-only', configured: true, operations: ['text_to_image'] as const };
    expect(modelSupportsOperation(textOnlyModel, 'text-to-image')).toBe('supported');
    expect(modelSupportsImageInput(textOnlyModel)).toBe('unsupported');
    expect(modelSupportsOperation({ id: 'unknown', configured: true }, 'image-edit')).toBe('unknown');
  });

  it('blocks image-edit readiness when the selected catalog model omits that operation', () => {
    expect(deriveComposerReadiness({
      profilesLoading: false,
      profilesError: null,
      hasSelectedProfile: true,
      modelsLoading: false,
      modelsError: null,
      selectedModelId: 'text-only',
      selectedModel: { id: 'text-only', configured: true, operations: ['text_to_image'] },
      attachmentPreparing: false,
      attachmentFailed: false,
      operation: 'image-edit',
      outputSettingsLoading: false,
      hasOutputMatrix: true,
      placementIntent: { kind: 'unbound', reason: 'no-photoshop-capture' },
      prompt: 'edit this image',
    })).toEqual({ state: 'model-does-not-support-image-edit', canSend: false });
  });
});

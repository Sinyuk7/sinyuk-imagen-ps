import { describe, expect, it } from 'vitest';
import { deriveComposerReadiness } from '../../../src/shared/ui/composer-readiness';

const textOnlyModel = {
  id: 'dall-e-3',
  configured: true,
  selected: true,
} as const;

const readyModel = {
  id: 'gpt-image-2',
  configured: true,
  selected: true,
} as const;

const base = {
  running: false,
  profilesLoading: false,
  profilesError: null,
  hasSelectedProfile: true,
  modelsLoading: false,
  modelsError: null,
  selectedModelId: 'gpt-image-2',
  selectedModel: readyModel,
  attachmentPreparing: false,
  attachmentFailed: false,
  operation: 'text-to-image' as const,
  outputSettingsLoading: false,
  hasOutputMatrix: true,
  placementIntent: { kind: 'unbound' as const, reason: 'no-photoshop-capture' as const },
  prompt: 'make image',
};

describe('composer readiness', () => {
  it('reports enter-prompt instead of allowing a silent no-op', () => {
    expect(deriveComposerReadiness({ ...base, prompt: '   ' })).toEqual({
      state: 'enter-prompt',
      canSend: false,
    });
  });

  it('does not infer operation blockers from profile model list items', () => {
    expect(deriveComposerReadiness({
      ...base,
      selectedModelId: 'dall-e-3',
      selectedModel: textOnlyModel,
      operation: 'image-edit',
      prompt: '',
    })).toEqual({
      state: 'enter-prompt',
      canSend: false,
    });
  });

  it('does not infer size blockers from profile model list items', () => {
    expect(deriveComposerReadiness({
      ...base,
      selectedModelId: 'dall-e-3',
      selectedModel: textOnlyModel,
      hasOutputMatrix: true,
      prompt: '',
    })).toEqual({
      state: 'enter-prompt',
      canSend: false,
    });
  });
});

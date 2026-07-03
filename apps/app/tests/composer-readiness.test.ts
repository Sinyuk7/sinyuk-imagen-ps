import { describe, expect, it } from 'vitest';
import { deriveComposerReadiness } from '../src/shared/ui/composer-readiness';

const textOnlyModel = {
  id: 'dall-e-3',
  supportStatus: 'selectable',
  capabilities: {
    operations: {
      textToImage: { support: 'supported', sizePresets: ['1k', '2k'] },
      imageEdit: { support: 'unsupported', sizePresets: [], reason: 'operation-unsupported' },
    },
  },
} as const;

const readyModel = {
  id: 'gpt-image-2',
  supportStatus: 'selectable',
  capabilities: {
    operations: {
      textToImage: { support: 'supported', sizePresets: ['512', '1k', '2k', '4k'] },
      imageEdit: { support: 'supported', sizePresets: ['512', '1k', '2k', '4k'] },
    },
  },
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
  outputSizePreset: '2k' as const,
  placementIntent: { kind: 'unbound' as const, reason: 'no-photoshop-capture' as const },
  prompt: 'make image',
  optimizing: false,
};

describe('composer readiness', () => {
  it('reports enter-prompt instead of allowing a silent no-op', () => {
    expect(deriveComposerReadiness({ ...base, prompt: '   ' })).toEqual({
      state: 'enter-prompt',
      canSend: false,
    });
  });

  it('keeps capability blockers ahead of prompt emptiness', () => {
    expect(deriveComposerReadiness({
      ...base,
      selectedModelId: 'dall-e-3',
      selectedModel: textOnlyModel,
      operation: 'image-edit',
      prompt: '',
    })).toEqual({
      state: 'model-does-not-support-image-edit',
      canSend: false,
    });
  });

  it('keeps size conflicts ahead of prompt emptiness', () => {
    expect(deriveComposerReadiness({
      ...base,
      selectedModelId: 'dall-e-3',
      selectedModel: textOnlyModel,
      outputSizePreset: '4k',
      prompt: '',
    })).toEqual({
      state: 'size-unsupported',
      canSend: false,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  createDefaultPromptSettings,
  createMemoryPromptSettingsStore,
  normalizePromptSettings,
} from '../src/shared/ports/prompt-settings';

describe('prompt settings normalization', () => {
  it('repairs structure and dangling selection without seeding deleted presets', () => {
    expect(normalizePromptSettings({
      optimization: { profileId: 42, template: '{Prompt}' },
      presets: {
        selectedId: 'missing',
        items: [],
      },
    })).toEqual({
      optimization: {
        profileId: null,
        template: '{Prompt}',
      },
      presets: {
        selectedId: null,
        items: [],
      },
    });
  });

  it('preserves invalid user-authored templates and duplicate names', () => {
    expect(normalizePromptSettings({
      optimization: { profileId: 'profile-a', template: 'no placeholder' },
      presets: {
        selectedId: 'preset-b',
        items: [
          { id: 'preset-a', name: 'Same', mode: 'replace', content: '{Prompt}' },
          { id: 'preset-b', name: 'Same', mode: 'prepend', content: '  keep spaces  ' },
        ],
      },
    })).toEqual({
      optimization: { profileId: 'profile-a', template: 'no placeholder' },
      presets: {
        selectedId: 'preset-b',
        items: [
          { id: 'preset-a', name: 'Same', mode: 'replace', content: '{Prompt}' },
          { id: 'preset-b', name: 'Same', mode: 'prepend', content: '  keep spaces  ' },
        ],
      },
    });
  });

  it('distinguishes a missing root from an existing empty preset list', async () => {
    const missing = createMemoryPromptSettingsStore();
    expect(await missing.load()).toBeNull();

    const defaults = createDefaultPromptSettings();
    await missing.save({ ...defaults, presets: { selectedId: null, items: [] } });
    expect(await missing.load()).toEqual({
      optimization: defaults.optimization,
      presets: { selectedId: null, items: [] },
    });
  });
});

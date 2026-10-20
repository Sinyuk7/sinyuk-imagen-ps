import { describe, expect, it } from 'vitest';
import { composerRunShortcutLabel, composerSettingsSummary, shouldSubmitComposerShortcut } from '../../../src/shared/ui/composer-control-presentation';

describe('composer control presentation', () => {
  it('summarizes effective configuration with a readable, bounded template label', () => {
    expect(composerSettingsSummary({
      labels: { model: '模型', template: '模板', ratio: '比例', size: '尺寸' },
      model: 'Image Model',
      template: '一段特别特别特别特别特别特别特别长的模板名称',
      ratio: '3:4',
      size: '2k',
    })).toBe('模型: Image Model\n模板: 一段特别特别特别特别特别特别特别长的模…\n比例: 3:4\n尺寸: 2K');
  });

  it('omits unavailable configuration values instead of inventing defaults', () => {
    expect(composerSettingsSummary({
      labels: { model: 'Model', template: 'Template', ratio: 'Ratio', size: 'Size' },
      model: 'Selected model',
    })).toBe('Model: Selected model');
  });

  it('selects one platform-specific shortcut label', () => {
    const labels = { mac: '⌘ + Enter', windows: 'Ctrl + Enter' };
    expect(composerRunShortcutLabel('Mozilla/5.0 Macintosh', 'MacIntel', labels)).toBe('⌘ + Enter');
    expect(composerRunShortcutLabel('Mozilla/5.0 Windows NT', 'Win32', labels)).toBe('Ctrl + Enter');
    expect(composerRunShortcutLabel('', '', labels)).toBe('Ctrl + Enter');
  });

  it('submits only on the platform modifier and preserves ordinary Enter for newlines', () => {
    const base = { key: 'Enter', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 13 };
    expect(shouldSubmitComposerShortcut(base, 'metaKey')).toBe(false);
    expect(shouldSubmitComposerShortcut({ ...base, metaKey: true }, 'metaKey')).toBe(true);
    expect(shouldSubmitComposerShortcut({ ...base, ctrlKey: true }, 'metaKey')).toBe(false);
    expect(shouldSubmitComposerShortcut({ ...base, ctrlKey: true }, 'ctrlKey')).toBe(true);
    expect(shouldSubmitComposerShortcut({ ...base, ctrlKey: true, shiftKey: true }, 'ctrlKey')).toBe(false);
    expect(shouldSubmitComposerShortcut({ ...base, ctrlKey: true, isComposing: true }, 'ctrlKey')).toBe(false);
    expect(shouldSubmitComposerShortcut({ ...base, ctrlKey: true, keyCode: 229 }, 'ctrlKey')).toBe(false);
  });
});

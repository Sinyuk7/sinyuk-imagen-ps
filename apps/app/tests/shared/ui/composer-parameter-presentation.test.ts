import { describe, expect, it } from 'vitest';
import { composerConfigurationSummary, projectComposerRatioSize, resolveComposerRatioSizeSource } from '../../../src/shared/ui/composer-parameter-presentation';

const choice = (value: string, label = value) => ({ value, label });

describe('composer parameter presentation', () => {
  it('projects GRSAI combined ratio and size choices without inventing request values', () => {
    const parameters = {
      aspectRatio: {
        type: 'choice' as const,
        default: '1024x1024',
        options: [choice('1024x1024', '1024x1024 (1:1, 1K)'), choice('2048x1152', '2048x1152 (16:9, 2K)')],
      },
    };
    const projection = projectComposerRatioSize(parameters, { aspectRatio: '1024x1024' });
    expect(projection.ratio?.value).toBe('1:1');
    expect(projection.size?.value).toBe('1K');
    expect(resolveComposerRatioSizeSource(projection, '16:9', '2K')).toBe('2048x1152');
    expect(resolveComposerRatioSizeSource(projection, '16:9', '1K')).toBeUndefined();
  });

  it('keeps separate provider ratio and resolution values independent', () => {
    const parameters = {
      aspectRatio: { type: 'choice' as const, default: 'auto', options: [choice('auto'), choice('16:9')] },
      resolution: { type: 'choice' as const, default: '1k', options: [choice('1k'), choice('2k')] },
    };
    const projection = projectComposerRatioSize(parameters, { aspectRatio: '16:9', resolution: '2k' });
    expect(projection.ratio?.value).toBe('16:9');
    expect(projection.size?.value).toBe('2k');
    expect(projection.ratioSourceName).toBe('aspectRatio');
    expect(projection.sizeSourceName).toBe('resolution');
  });

  it('shows a compact summary, omitting default advanced values', () => {
    const parameters = {
      quality: { type: 'choice' as const, default: 'high', options: [choice('high'), choice('max')] },
      input_fidelity: { type: 'choice' as const, default: 'default', options: [choice('default'), choice('high')] },
    };
    expect(composerConfigurationSummary({ modelLabel: 'GPT Image', ratio: '16:9', size: '2k', parameters, values: { quality: 'max', input_fidelity: 'default' } })).toBe('GPT Image · 16:9 · 2K · Max');
  });
});

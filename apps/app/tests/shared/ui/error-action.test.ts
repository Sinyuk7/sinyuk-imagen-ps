import { describe, expect, it } from 'vitest';
import { classifyRoundError } from '../../../src/shared/ui/error-action';

describe('classifyRoundError', () => {
  it('classifies generated image persistence failures without falling back to unknown', () => {
    expect(classifyRoundError('Generated image persistence failed.')).toEqual({
      category: 'generated-image-persistence-failed',
      primaryAction: 'copy-error-details',
      message: 'Generated image persistence failed.',
    });
  });
});

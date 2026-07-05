import { describe, expect, it } from 'vitest';
import { classifyRoundError } from '../../../src/shared/ui/error-action';

describe('classifyRoundError', () => {
  it('recognizes qwen image-edit relay incompatibility and keeps the request id', () => {
    const failure = classifyRoundError(
      'provider: expected io.Reader for image edits mode, got *ali.AliImageRequest (request id: 202607040129349311348194Ujmriyw)',
    );

    expect(failure).toMatchObject({
      category: 'provider-protocol-incompatible',
      primaryAction: 'open-provider-settings',
      message: 'expected io.Reader for image edits mode, got *ali.AliImageRequest',
      requestId: '202607040129349311348194Ujmriyw',
    });
    expect(failure.detail).toContain('provider: expected io.Reader for image edits mode');
  });
});

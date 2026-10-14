import { describe, expect, it } from 'vitest';
import type { FixedGenerationRequest, FixedProviderResult } from '../src/index.js';

describe('fixed generation contract', () => {
  it('keeps provider wire fields out of the public request', () => {
    const request: FixedGenerationRequest = {
      providerId: 'grsai', modelId: 'gpt-image-2.5-flare', operation: 'image_edit',
      prompt: 'test', parameters: { size: '1024x1024' },
    };
    expect(request).not.toHaveProperty('replyType');
    expect(request).not.toHaveProperty('endpoint');
  });

  it('represents provider output without protocol identity', () => {
    const result: FixedProviderResult = { assets: [], metadata: { width: 1024, height: 1024, format: 'png' } };
    expect(result.metadata?.width).toBe(1024);
  });
});

import { describe, expect, it } from 'vitest';
import { prepareGrsaiRequest, prepareRunningHubRequest } from '../src/index.js';

describe('fixed provider request adapters', () => {
  it('adds GRSAI async protocol fields internally', () => {
    const result = prepareGrsaiRequest({ providerId: 'grsai', modelId: 'gpt-image-2.5-flare', operation: 'text_to_image', prompt: 'a cat', parameters: { aspectRatio: '1024x1024', quality: 'medium', input_fidelity: 'default' } });
    expect(result.urlPath).toBe('/v1/api/generate');
    expect(result.body.replyType).toBe('async');
  });
  it('selects RunningHub endpoint from catalog', () => {
    const result = prepareRunningHubRequest({ providerId: 'runninghub', modelId: 'rh:nano-banana-2-stable', operation: 'image_edit', prompt: 'a cat', parameters: { aspectRatio: '1:1', resolution: '1k' } });
    expect(result.urlPath).toMatch(/^\/openapi\//);
    expect(result.body).toHaveProperty('imageUrls');
  });
});

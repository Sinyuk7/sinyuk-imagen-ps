import { describe, expect, it } from 'vitest';
import { prepareRunningHubRequest } from '../src/fixed-provider-adapters.js';

const base = {
  providerId: 'runninghub' as const,
  modelId: 'rh:nano-banana-2-economy',
  prompt: 'test',
  parameters: { aspectRatio: '1:1', resolution: '1k' },
};

describe('RunningHub operation routing', () => {
  it('uses text-to-image route without imageUrls for prompt-only requests', () => {
    const prepared = prepareRunningHubRequest({ ...base, operation: 'text_to_image' });
    expect(prepared.urlPath).toBe('/openapi/v2/rhart-image-n-g31-flash/text-to-image');
    expect(prepared.body).not.toHaveProperty('imageUrls');
    expect(prepared.body).not.toHaveProperty('maskUrl');
  });

  it('omits auto aspect ratio from the wire request', () => {
    const prepared = prepareRunningHubRequest({ ...base, parameters: { aspectRatio: 'auto', resolution: '1k' }, operation: 'text_to_image' });
    expect(prepared.body).not.toHaveProperty('aspectRatio');
  });

  it('rejects mask input for models without mask support', () => {
    expect(() => prepareRunningHubRequest({ ...base, operation: 'image_edit', images: [{ type: 'image', url: 'https://example.test/input.png' }], maskImage: { asset: { type: 'image', url: 'https://example.test/mask.png' } } })).toThrow(/does not support mask input/);
  });

  it('uses image-to-image route and includes imageUrls for edit requests', () => {
    const prepared = prepareRunningHubRequest({
      ...base,
      operation: 'image_edit',
      images: [{ type: 'image', url: 'https://example.test/input.png' }],
    });
    expect(prepared.urlPath).toBe('/openapi/v2/rhart-image-n-g31-flash/image-to-image');
    expect(prepared.body).toMatchObject({ imageUrls: ['https://example.test/input.png'] });
  });
});

import { describe, expect, it } from 'vitest';

import { buildEditRequestBody, buildRequestBody } from '../src/transport/openai-compatible/build-request.js';
import type { CanonicalImageJobRequest } from '../src/contract/request.js';

describe('buildRequestBody (generate)', () => {
  it('maps request.output fields to documented OpenAPI body fields', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'generate',
      prompt: 'a cat',
      output: {
        count: 2,
        width: 1024,
        height: 1024,
        background: 'transparent',
        quality: 'high',
        outputFormat: 'png',
        outputCompression: 90,
        moderation: 'low',
      },
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildRequestBody(request);

    expect(body).toMatchObject({
      model: 'gpt-image-1.5',
      prompt: 'a cat',
      n: 2,
      size: '1024x1024',
      background: 'transparent',
      quality: 'high',
      output_format: 'png',
      output_compression: 90,
      moderation: 'low',
    });
  });

  it('does not map inputFidelity on generate', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'generate',
      prompt: 'x',
      output: { inputFidelity: 'high' },
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildRequestBody(request);

    expect(body).not.toHaveProperty('input_fidelity');
  });

  it('blocks providerOptions from overriding surfaced fields', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'generate',
      prompt: 'x',
      output: { quality: 'high' },
      providerOptions: { model: 'gpt-image-1.5', quality: 'low', output_format: 'webp' },
    };

    const body = buildRequestBody(request);

    expect(body.quality).toBe('high');
    expect(body.output_format).toBeUndefined();
  });

  it('allows providerOptions to pass through non-surfaced fields', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'generate',
      prompt: 'x',
      providerOptions: { model: 'dall-e-3', style: 'vivid' },
    };

    const body = buildRequestBody(request);

    expect(body.style).toBe('vivid');
  });

  it('defaults response_format to url for non-GPT image models', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'generate',
      prompt: 'x',
      providerOptions: { model: 'dall-e-3' },
    };

    const body = buildRequestBody(request);

    expect(body.response_format).toBe('url');
  });

  it('omits response_format for GPT image models', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'generate',
      prompt: 'x',
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildRequestBody(request);

    expect(body).not.toHaveProperty('response_format');
  });
});

describe('buildEditRequestBody', () => {
  it('maps inputAssets with external URL to image_url reference', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'make it green',
      inputAssets: [{ type: 'image', url: 'https://example.com/a.png' }],
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildEditRequestBody(request);

    expect(body.images).toEqual([{ image_url: 'https://example.com/a.png' }]);
  });

  it('maps inputAssets with inline base64 data to data URL', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'make it green',
      inputAssets: [{ type: 'image', data: 'AAA', mimeType: 'image/png' }],
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildEditRequestBody(request);

    expect(body.images).toEqual([{ image_url: 'data:image/png;base64,AAA' }]);
  });

  it('maps inputAssets with fileId preferentially to file_id reference', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'x',
      inputAssets: [{ type: 'image', fileId: 'file-abc123', url: 'https://example.com/a.png' }],
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildEditRequestBody(request);

    expect(body.images).toEqual([{ file_id: 'file-abc123' }]);
  });

  it('maps maskAsset to mask object with file_id when present', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'x',
      inputAssets: [{ type: 'image', url: 'https://example.com/a.png' }],
      maskAsset: { type: 'image', fileId: 'file-mask-1' },
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildEditRequestBody(request);

    expect(body.mask).toEqual({ file_id: 'file-mask-1' });
  });

  it('maps maskAsset with base64 data to mask.image_url', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'x',
      inputAssets: [{ type: 'image', url: 'https://example.com/a.png' }],
      maskAsset: { type: 'image', data: 'MASK', mimeType: 'image/png' },
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildEditRequestBody(request);

    expect(body.mask).toEqual({ image_url: 'data:image/png;base64,MASK' });
  });

  it('rejects empty inputAssets', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'x',
      inputAssets: [],
      providerOptions: { model: 'gpt-image-1.5' },
    };

    expect(() => buildEditRequestBody(request)).toThrow(/at least one input asset/);
  });

  it('rejects asset that has neither fileId, url nor data', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'x',
      inputAssets: [{ type: 'image' }],
      providerOptions: { model: 'gpt-image-1.5' },
    };

    expect(() => buildEditRequestBody(request)).toThrow(/requires fileId, url, or base64 data/);
  });

  it('maps input_fidelity only on edit path', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'x',
      inputAssets: [{ type: 'image', url: 'https://example.com/a.png' }],
      output: { inputFidelity: 'high', quality: 'medium' },
      providerOptions: { model: 'gpt-image-1.5' },
    };

    const body = buildEditRequestBody(request);

    expect(body.input_fidelity).toBe('high');
    expect(body.quality).toBe('medium');
  });

  it('blocks providerOptions from overriding surfaced quality / output_format / input_fidelity', () => {
    const request: CanonicalImageJobRequest = {
      operation: 'edit',
      prompt: 'x',
      inputAssets: [{ type: 'image', url: 'https://example.com/a.png' }],
      output: { quality: 'high', outputFormat: 'png' },
      providerOptions: {
        model: 'gpt-image-1.5',
        quality: 'low',
        output_format: 'webp',
        input_fidelity: 'low',
      },
    };

    const body = buildEditRequestBody(request);

    expect(body.quality).toBe('high');
    expect(body.output_format).toBe('png');
    expect(body).not.toHaveProperty('input_fidelity');
  });
});

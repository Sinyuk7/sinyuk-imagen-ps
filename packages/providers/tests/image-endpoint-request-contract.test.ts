import { describe, expect, it } from 'vitest';
import {
  buildImageEditHttpRequest,
} from '../src/transport/image-endpoint/build-request.js';
import { imageEndpointModel } from './model-execution.js';

function fileSummary(entry: FormDataEntryValue | null): { type: string; name?: string } | null {
  if (!(entry instanceof Blob)) {
    return null;
  }
  const file = entry as Blob & { readonly name?: string };
  return {
    type: file.type,
    ...(file.name ? { name: file.name } : {}),
  };
}

describe('image endpoint request contract characterization', () => {
  it('records the multipart-bracket request shape for inline image edits', () => {
    const built = buildImageEditHttpRequest(
      {
        operation: 'image_edit',
        prompt: 'make it blue',
        images: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png', name: 'input.png' }],
        maskImage: { type: 'image', data: 'd29ybGQ=', mimeType: 'image/png', name: 'mask.png' },
        output: {
          count: 2,
          sizePreset: '1k',
          aspectRatio: '1:1',
          outputFormat: 'png',
          quality: 'medium',
        },
        providerOptions: {
          custom_flag: 'kept',
        },
        model: imageEndpointModel('gpt-image-2'),
      },
      'multipart-bracket',
    );
    const body = built.body as FormData;

    expect(body.get('model')).toBe('gpt-image-2');
    expect(body.get('prompt')).toBe('make it blue');
    expect(body.get('n')).toBe('2');
    expect(body.get('size')).toBe('1024x1024');
    expect(body.get('output_format')).toBe('png');
    expect(body.get('quality')).toBe('medium');
    expect(body.get('custom_flag')).toBeNull();
    expect(built.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'provider_options.unknown_ignored' }),
    ]));
    expect(body.getAll('image[]')).toHaveLength(1);
    expect(fileSummary(body.getAll('image[]')[0] ?? null)).toEqual({
      type: 'image/png',
      name: 'input.png',
    });
    expect(fileSummary(body.get('mask'))).toEqual({
      type: 'image/png',
      name: 'mask.png',
    });
  });

  it('records the current multipart-plain field naming', () => {
    const body = buildImageEditHttpRequest(
      {
        operation: 'image_edit',
        prompt: 'plain multipart',
        images: [
          { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
          { type: 'image', data: 'd29ybGQ=', mimeType: 'image/jpeg' },
        ],
        model: imageEndpointModel('gpt-image-2'),
      },
      'multipart-plain',
    ).body as FormData;

    expect(body.getAll('image')).toHaveLength(2);
    expect(body.getAll('image[]')).toHaveLength(0);
  });

  it('records the json-reference request shape', () => {
    const built = buildImageEditHttpRequest(
      {
        operation: 'image_edit',
        prompt: 'json references',
        images: [
          { type: 'image', url: 'https://example.com/input.png' },
          { type: 'image', fileId: 'file_123' },
        ],
        maskImage: { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
        output: {
          inputFidelity: 'high',
          outputFormat: 'webp',
        },
        providerOptions: {
          custom_flag: true,
        },
        model: imageEndpointModel('gpt-image-2'),
      },
      'json-reference',
    );
    const body = built.body;

    expect(body).not.toBeInstanceOf(FormData);
    expect(body).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'json references',
      images: [
        { image_url: 'https://example.com/input.png' },
        { file_id: 'file_123' },
      ],
      mask: { image_url: 'data:image/png;base64,aGVsbG8=' },
      input_fidelity: 'high',
      output_format: 'webp',
    });
    expect(built.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'provider_options.unknown_ignored' }),
    ]));
  });

  it('prevents providerOptions from overriding codec-owned fields and reports diagnostics', () => {
    const built = buildImageEditHttpRequest(
      {
        operation: 'image_edit',
        prompt: 'providerOptions passthrough',
        images: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }],
        output: {
          sizePreset: '1k',
          aspectRatio: '1:1',
        },
        providerOptions: {
          image: 'text-field-collision',
          size: '999x999',
          image_response_format: 'b64_json',
          custom_flag: 'kept',
        },
        model: imageEndpointModel('gpt-image-2'),
      },
      'multipart-bracket',
    );
    const body = built.body as FormData;

    expect(body.get('size')).toBe('1024x1024');
    expect(body.get('custom_flag')).toBeNull();
    expect(body.get('image_response_format')).toBeNull();
    expect(body.get('image')).toBeNull();
    expect(body.getAll('image[]')).toHaveLength(1);
    expect(built.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'provider_options.reserved_ignored', details: { key: 'image' } }),
      expect.objectContaining({ code: 'provider_options.unknown_ignored', details: { key: 'custom_flag' } }),
    ]));
  });
});

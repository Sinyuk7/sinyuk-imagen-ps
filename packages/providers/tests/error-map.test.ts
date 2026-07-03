import { describe, expect, it } from 'vitest';
import { mapHttpError } from '../src/transport/image-endpoint/error-map.js';

describe('image-endpoint error map', () => {
  it('maps the qwen image-edit relay incompatibility to a structured non-retryable kind', () => {
    const error = mapHttpError({
      statusCode: 500,
      message: 'expected io.Reader for image edits mode, got *ali.AliImageRequest (request id: req_123)',
      details: {
        url: 'https://llm-api.net/v1/images/edits',
        method: 'POST',
      },
    });

    expect(error.kind).toBe('provider_protocol_incompatible');
    expect(error.statusCode).toBe(500);
    expect(error.details).toMatchObject({
      url: 'https://llm-api.net/v1/images/edits',
      method: 'POST',
      retryable: false,
      suggestedTransport: 'qwen-native-json',
    });
  });
});

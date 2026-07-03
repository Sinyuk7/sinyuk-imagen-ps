import { describe, expect, it } from 'vitest';
import { classifyImageEditRequestShapeRejection } from '../src/transport/image-endpoint/request-shape-classifier.js';

function requestInvalidError(args: {
  readonly statusCode: number;
  readonly message: string;
  readonly responseBody?: unknown;
}) {
  return {
    kind: 'request_invalid',
    statusCode: args.statusCode,
    message: args.message,
    details: {
      responseBody: args.responseBody,
    },
  };
}

describe('image endpoint request-shape classifier', () => {
  it('accepts 415 without allowlist terms when no accepted-work signal exists', () => {
    const result = classifyImageEditRequestShapeRejection(requestInvalidError({
      statusCode: 415,
      message: 'Unsupported Media Type',
    }));

    expect(result).toMatchObject({
      eligible: true,
      reason: 'http_415',
      statusCode: 415,
    });
  });

  it('accepts 400 allowlist-backed multipart field failures', () => {
    const result = classifyImageEditRequestShapeRejection(requestInvalidError({
      statusCode: 400,
      message: 'Expected file field image[] in multipart/form-data body.',
    }));

    expect(result).toMatchObject({
      eligible: true,
      reason: 'allowlist_match',
      statusCode: 400,
    });
    expect(result.matchedAllowTerms).toEqual(expect.arrayContaining(['image[]', 'multipart', 'file field']));
  });

  it('rejects 400 prompt/model/size style request-invalid errors', () => {
    const result = classifyImageEditRequestShapeRejection(requestInvalidError({
      statusCode: 400,
      message: 'Invalid model and size combination.',
    }));

    expect(result).toMatchObject({
      eligible: false,
      reason: 'deny_term_detected',
      statusCode: 400,
    });
    expect(result.matchedDenyTerms).toEqual(expect.arrayContaining(['model', 'size']));
  });

  it('rejects 422 without request-shape allowlist evidence', () => {
    const result = classifyImageEditRequestShapeRejection(requestInvalidError({
      statusCode: 422,
      message: 'Validation failed.',
    }));

    expect(result).toMatchObject({
      eligible: false,
      reason: 'missing_allowlist_evidence',
      statusCode: 422,
    });
  });

  it('blocks fallback when accepted-work evidence is present', () => {
    const result = classifyImageEditRequestShapeRejection(requestInvalidError({
      statusCode: 415,
      message: 'Unsupported Media Type',
      responseBody: {
        task_id: 'task_123',
        status: 'queued',
      },
    }));

    expect(result).toMatchObject({
      eligible: false,
      reason: 'accepted_work_detected',
      statusCode: 415,
    });
    expect(result.acceptedWorkSignals).toEqual(expect.arrayContaining(['task_id', 'status:queued']));
  });
});

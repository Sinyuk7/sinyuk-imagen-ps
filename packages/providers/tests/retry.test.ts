import { describe, expect, it } from 'vitest';
import { withRetry } from '../src/transport/image-endpoint/retry.js';

describe('image endpoint retry', () => {
  it('does not require AbortSignal listener methods for retry backoff', async () => {
    const signal = { aborted: false } as AbortSignal;
    const networkError = Object.assign(new Error('offline'), { kind: 'network_error' });
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw networkError;
        }
        return 'ok';
      },
      { maxRetries: 1, baseDelayMs: 0, factor: 1 },
      signal,
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });
});

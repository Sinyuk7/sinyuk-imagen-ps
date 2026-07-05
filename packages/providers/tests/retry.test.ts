import { describe, expect, it, vi } from 'vitest';
import { withRetry, classifyPaidRetry } from './../src/transport/image-endpoint/retry.js';

function errorWithKind(kind: string, statusCode?: number): Error {
  const error = new Error(`${kind}`) as Error & { kind: string; statusCode?: number };
  error.kind = kind;
  if (statusCode !== undefined) {
    error.statusCode = statusCode;
  }
  return error;
}

describe('image endpoint retry — broad mode (backward compatible)', () => {
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

  it('aborts retry backoff even when the AbortSignal polyfill has no event listeners', async () => {
    vi.useFakeTimers();
    try {
      const signal = { aborted: false } as AbortSignal;
      const networkError = Object.assign(new Error('offline'), { kind: 'network_error' });
      let attempts = 0;

      const pending = withRetry(
        async () => {
          attempts += 1;
          throw networkError;
        },
        { maxRetries: 1, baseDelayMs: 1_000, factor: 1 },
        signal,
      );
      const rejection = expect(pending).rejects.toMatchObject({ kind: 'timeout' });

      signal.aborted = true;
      await vi.advanceTimersByTimeAsync(60);

      await rejection;
      expect(attempts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('image endpoint retry — paid mode (no idempotency)', () => {
  // 默认付费策略：只重试「可证明未被服务端处理」的状态（429/503）；
  // 502/504/network_error/timeout 不自动重试，避免重复扣费。

  const paidOpts = { retryability: 'paid' as const, idempotencySupported: false };
  const fastPolicy = { maxRetries: 3, baseDelayMs: 0, factor: 1 };

  it('retries 429 (rate-limited, provably not processed)', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw errorWithKind('rate_limited', 429);
        }
        return 'ok';
      },
      fastPolicy,
      undefined,
      undefined,
      undefined,
      paidOpts,
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does NOT retry 503 (execution state unknown under replay-safety policy)', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('upstream_unavailable', 503);
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('does NOT retry 502 (ambiguous gateway) — double-charge guard', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('upstream_unavailable', 502);
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('does NOT retry 504 (ambiguous upstream timeout) — double-charge guard', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('upstream_unavailable', 504);
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('does NOT retry network_error (response may be lost after processing) — double-charge guard', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('network_error');
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('does NOT retry timeout (request may have been processed) — double-charge guard', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('timeout');
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('does NOT retry 415 request_invalid (codec fallback owns that decision)', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('request_invalid', 415);
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});

describe('image endpoint retry — paid mode WITH idempotency support', () => {
  // 当 provider 透传稳定 Idempotency-Key 时，模糊失败可安全重试（timeout 仍不重试）。

  const paidIdemOpts = { retryability: 'paid' as const, idempotencySupported: true };
  const fastPolicy = { maxRetries: 3, baseDelayMs: 0, factor: 1 };

  it('does NOT retry network_error even when idempotency is supported', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('network_error');
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidIdemOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('does NOT retry 502 even when idempotency is supported', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('upstream_unavailable', 502);
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidIdemOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('still does NOT retry timeout even with idempotency', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw errorWithKind('timeout');
        },
        fastPolicy,
        undefined,
        undefined,
        undefined,
        paidIdemOpts,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});

describe('classifyPaidRetry (pure)', () => {
  const no = false;
  const yes = true;

  it('retries 429 regardless of idempotency', () => {
    expect(classifyPaidRetry(errorWithKind('rate_limited', 429), no)).toBe(true);
    expect(classifyPaidRetry(errorWithKind('rate_limited', 429), yes)).toBe(true);
  });

  it('does NOT retry 503 regardless of idempotency', () => {
    expect(classifyPaidRetry(errorWithKind('upstream_unavailable', 503), no)).toBe(false);
    expect(classifyPaidRetry(errorWithKind('upstream_unavailable', 503), yes)).toBe(false);
  });

  it('502/504 do NOT retry under replay-safety policy', () => {
    expect(classifyPaidRetry(errorWithKind('upstream_unavailable', 502), no)).toBe(false);
    expect(classifyPaidRetry(errorWithKind('upstream_unavailable', 502), yes)).toBe(false);
    expect(classifyPaidRetry(errorWithKind('upstream_unavailable', 504), no)).toBe(false);
    expect(classifyPaidRetry(errorWithKind('upstream_unavailable', 504), yes)).toBe(false);
  });

  it('network_error does NOT retry regardless of idempotency', () => {
    expect(classifyPaidRetry(errorWithKind('network_error'), no)).toBe(false);
    expect(classifyPaidRetry(errorWithKind('network_error'), yes)).toBe(false);
  });

  it('timeout never retries', () => {
    expect(classifyPaidRetry(errorWithKind('timeout'), no)).toBe(false);
    expect(classifyPaidRetry(errorWithKind('timeout'), yes)).toBe(false);
  });

  it('non-retryable status codes do not retry', () => {
    expect(classifyPaidRetry(errorWithKind('auth_failed', 401), no)).toBe(false);
    expect(classifyPaidRetry(errorWithKind('request_invalid', 415), no)).toBe(false);
    expect(classifyPaidRetry(errorWithKind('unknown_provider_error', 500), no)).toBe(false);
  });
});

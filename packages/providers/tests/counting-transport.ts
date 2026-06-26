/**
 * 传输层测试用 counting fake。
 *
 * 位于 `provider.invoke` 之下、`withRetry` 之内：通过 stub 全局 `fetch` 统计真正的
 * outbound HTTP attempt（L4），与 `provider.invoke` 调用数（L3）分离——只有 L4 能
 * 看到 transport 自动重试驱动的重复付费请求。
 *
 * 不连接任何真实 Provider / 网络，不产生真实费用。
 */

import { vi } from 'vitest';

export interface RecordedFetchCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export type FetchProgramStep =
  | { readonly kind: 'response'; readonly status?: number; readonly data?: unknown }
  | { readonly kind: 'network_error' }
  | { readonly kind: 'timeout' };

export interface CountingFetch {
  readonly fetch: typeof fetch;
  readonly calls: RecordedFetchCall[];
  /** 已消费的 program step 数（即真实 attempt 数）。 */
  readonly attemptCount: () => number;
  readonly reset: () => void;
}

/**
 * 创建可编程的 counting fetch。
 *
 * @param program 每次 attempt 的行为序列；第 N 次 attempt 取 `program[N]`，
 *   超出长度时取最后一项。
 */
export function createCountingFetch(program: readonly FetchProgramStep[]): CountingFetch {
  const calls: RecordedFetchCall[] = [];

  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const index = calls.length;
    const step = program[Math.min(index, program.length - 1)];

    const headers: Record<string, string> = {};
    const headerInit = init?.headers;
    if (headerInit) {
      if (headerInit instanceof Headers) {
        headerInit.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(headerInit)) {
        for (const [key, value] of headerInit) {
          headers[key] = value;
        }
      } else {
        for (const [key, value] of Object.entries(headerInit)) {
          headers[key] = value;
        }
      }
    }

    calls.push({
      url: typeof url === 'string' ? url : url.toString(),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
    });

    if (step.kind === 'network_error') {
      const error = new TypeError('Failed to fetch');
      throw error;
    }
    if (step.kind === 'timeout') {
      const error = new Error('Request timed out.');
      error.name = 'TimeoutError';
      throw error;
    }

    const status = step.status ?? 200;
    const data = step.data ?? { ok: true };
    const response: Response = {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : `HTTP ${status}`,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => data,
      text: async () => JSON.stringify(data),
    } as Response;
    return response;
  }) as unknown as typeof fetch;

  return {
    fetch,
    calls,
    attemptCount: () => calls.length,
    reset: () => {
      calls.length = 0;
      fetch.mockClear();
    },
  };
}

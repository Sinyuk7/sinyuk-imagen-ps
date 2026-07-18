import type { ComfyUiExecutionHostPorts } from '@imagen-ps/application';

type ComfyUiHttpTransport = ComfyUiExecutionHostPorts['httpTransport'];
type ComfyUiHttpRequest = Parameters<ComfyUiHttpTransport['request']>[0];

/** Chrome 与 UXP 可注入的最小 fetch shape。 */
export type ComfyUiFetch = (input: string, init?: RequestInit) => Promise<Response>;

function requestUrl(request: ComfyUiHttpRequest): string {
  const origin = new URL(request.origin);
  const target = new URL(request.path, `${origin.origin}/`);
  if (
    target.origin !== origin.origin
    || (target.protocol !== 'http:' && target.protocol !== 'https:')
    || target.username.length > 0
    || target.password.length > 0
    || target.hash.length > 0
  ) {
    throw new Error('ComfyUI transport rejected an unsafe request URL.');
  }
  return target.toString();
}

function responseHeaders(headers: Headers): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  headers.forEach((value, key) => {
    values[key.toLowerCase()] = value;
  });
  return values;
}

function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      parent?.removeEventListener('abort', abort);
    },
  };
}

/** 创建不解释 ComfyUI payload 的 bounded fetch transport。 */
export function createComfyUiHttpTransport(fetchImpl: ComfyUiFetch = globalThis.fetch): ComfyUiHttpTransport {
  return {
    async request(request, parentSignal) {
      const url = requestUrl(request);
      const scoped = requestSignal(parentSignal, request.timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: request.method,
          credentials: 'omit',
          signal: scoped.signal,
          ...(request.headers === undefined ? {} : { headers: request.headers }),
          ...(request.body === undefined ? {} : { body: request.body as BodyInit }),
        });
        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > request.maxResponseBytes) {
          throw new Error('ComfyUI transport response exceeded the byte limit.');
        }
        const body = new Uint8Array(await response.arrayBuffer());
        if (body.byteLength > request.maxResponseBytes) {
          throw new Error('ComfyUI transport response exceeded the byte limit.');
        }
        return {
          status: response.status,
          headers: responseHeaders(response.headers),
          body,
        };
      } finally {
        scoped.dispose();
      }
    },
  };
}

/**
 * 逐 endpoint 执行无鉴权 HEAD 可达性探测。
 */
export async function probeEndpointReachability(
  endpoint: { readonly url: string },
  options?: {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  },
): Promise<{ readonly status: number }> {
  const { signal, timeoutMs } = options ?? {};
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const abort = (reason?: unknown) => {
    if (!controller) {
      return;
    }
    try {
      controller.abort(reason);
    } catch {
      controller.abort();
    }
  };
  const onAbort = () => abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }
  const timer = controller && timeoutMs !== undefined
    ? setTimeout(() => {
      const error = new Error('Request timed out.');
      error.name = 'TimeoutError';
      abort(error);
    }, timeoutMs)
    : undefined;
  const mergedSignal = controller?.signal ?? signal;
  try {
    const response = await fetch(endpoint.url, {
      method: 'HEAD',
      ...(mergedSignal ? { signal: mergedSignal } : {}),
    });
    return { status: response.status };
  } catch (error) {
    const reason = error instanceof Error ? error : new Error(String(error));
    if (reason.name === 'AbortError' || reason.name === 'TimeoutError') {
      const timeout = new Error('Request timed out.') as Error & { kind?: string };
      timeout.name = 'TimeoutError';
      timeout.kind = 'timeout';
      throw timeout;
    }
    const network = new Error(reason.message) as Error & { kind?: string };
    network.kind = 'network_error';
    throw network;
  } finally {
    if (signal) {
      signal.removeEventListener?.('abort', onAbort);
    }
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

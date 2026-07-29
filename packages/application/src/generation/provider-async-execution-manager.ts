import type {
  ProviderAsyncExecutionExecutor,
  ProviderAsyncPollResult,
  ProviderInvokeResult,
} from '@imagen-ps/providers';

export interface ProviderAsyncExecutionManagerOptions {
  readonly now?: () => number;
  readonly sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  readonly maxPolls?: number;
  readonly maxElapsedMs?: number;
  readonly minPollDelayMs?: number;
  readonly maxPollDelayMs?: number;
}

/** Application runtime 持有的异步 Provider 执行 manager。 */
export interface ProviderAsyncExecutionManager extends ProviderAsyncExecutionExecutor {
  /** 停止本地等待并释放所有未完成执行。 */
  dispose(): void;
}

function abortError(): Error {
  return new Error('Provider async execution was aborted.');
}

function budgetError(): Error {
  return new Error('Provider async result was not confirmed before polling budget expired.');
}

function disposedError(): Error {
  return new Error('Provider async execution manager has been disposed.');
}

function reentryError(): Error {
  return new Error('Provider async execution has already been started for this job.');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function linkAbortSignal(controller: AbortController, source?: AbortSignal): () => void {
  if (source?.aborted) {
    controller.abort(source.reason);
    return () => {};
  }

  const onAbort = () => controller.abort(source?.reason);
  source?.addEventListener('abort', onAbort, { once: true });
  return () => source?.removeEventListener('abort', onAbort);
}

/** 创建 Application runtime 持有的 Provider 异步执行 manager。 */
export function createProviderAsyncExecutionManager(
  options: ProviderAsyncExecutionManagerOptions = {},
): ProviderAsyncExecutionManager {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const maxPolls = options.maxPolls ?? 60;
  const maxElapsedMs = options.maxElapsedMs ?? 10 * 60 * 1000;
  const minPollDelayMs = options.minPollDelayMs ?? 250;
  const maxPollDelayMs = options.maxPollDelayMs ?? 10_000;
  const inFlight = new Map<string, { readonly promise: Promise<ProviderInvokeResult>; readonly controller: AbortController }>();
  const startedJobIds = new Set<string>();
  let disposed = false;

  const delayFor = (suggested: number | undefined): number => {
    const value = typeof suggested === 'number' && Number.isFinite(suggested)
      ? Math.floor(suggested)
      : minPollDelayMs;
    return Math.max(minPollDelayMs, Math.min(maxPollDelayMs, value));
  };

  return {
    execute(args) {
      if (disposed) {
        return Promise.reject(disposedError());
      }
      const existing = inFlight.get(args.jobId);
      if (existing) return existing.promise;
      if (startedJobIds.has(args.jobId)) {
        return Promise.reject(reentryError());
      }
      startedJobIds.add(args.jobId);

      const controller = new AbortController();
      const unlinkAbortSignal = linkAbortSignal(controller, args.invokeArgs.signal);
      const execute = async (): Promise<ProviderInvokeResult> => {
        try {
          throwIfAborted(controller.signal);
          const invokeArgs = { ...args.invokeArgs, signal: controller.signal };
          const startedAt = now();
          const submission = await args.lifecycle.submit(invokeArgs as never);
          if (submission.status === 'completed') return submission.result;

          let nextDelayMs = delayFor(submission.nextPollAfterMs);
          let polls = 0;
          while (true) {
            if (polls >= maxPolls || now() - startedAt >= maxElapsedMs) throw budgetError();
            await sleep(nextDelayMs, controller.signal);
            throwIfAborted(controller.signal);
            polls += 1;
            const outcome: ProviderAsyncPollResult = await args.lifecycle.poll({
              remoteRef: submission.remoteRef,
              signal: controller.signal,
              ...(args.invokeArgs.logger !== undefined ? { logger: args.invokeArgs.logger } : {}),
            });
            if (outcome.status === 'completed') return outcome.result;
            if (outcome.status === 'failed') throw outcome.error;
            nextDelayMs = delayFor(outcome.nextPollAfterMs);
          }
        } finally {
          unlinkAbortSignal();
        }
      };
      const promise = execute().finally(() => {
        if (inFlight.get(args.jobId)?.promise === promise) inFlight.delete(args.jobId);
      });
      inFlight.set(args.jobId, { promise, controller });
      return promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const execution of inFlight.values()) {
        execution.controller.abort();
      }
      inFlight.clear();
      startedJobIds.clear();
    },
  };
}

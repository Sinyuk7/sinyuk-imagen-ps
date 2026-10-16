/** 异步任务运行时策略；单位统一为毫秒，避免调用方混用秒和毫秒。 */
export interface RuntimePolicy {
  readonly asyncTask: {
    readonly pollIntervalMs: number;
    readonly timeoutMs: number | null;
    readonly maxPolls: number | null;
  };
}

/** 运行时策略的可替换远端来源。 */
export interface RuntimePolicyRemoteSource {
  readonly load: () => Promise<unknown>;
}

/** 运行时策略解析结果，保留来源与回退原因。 */
export interface RuntimePolicyResolution {
  readonly policy: RuntimePolicy;
  readonly source: 'remote' | 'local';
  readonly fallbackReason?: string;
}

/** 发布物内置的安全默认运行时策略。 */
export const defaultRuntimePolicy: RuntimePolicy = Object.freeze({
  asyncTask: Object.freeze({
    pollIntervalMs: 3000,
    timeoutMs: 10 * 60 * 1000,
    maxPolls: null,
  }),
});

/** 校验并冻结运行时策略，供本地或远端配置源复用。 */
export function parseRuntimePolicy(input: unknown): RuntimePolicy {
  if (typeof input !== 'object' || input === null) throw new Error('Runtime policy must be an object.');
  const asyncTask = (input as Record<string, unknown>).asyncTask;
  if (typeof asyncTask !== 'object' || asyncTask === null) throw new Error('Runtime policy requires asyncTask.');
  const record = asyncTask as Record<string, unknown>;
  const pollIntervalMs = record.pollIntervalMs;
  const timeoutMs = record.timeoutMs;
  const maxPolls = record.maxPolls;
  if (typeof pollIntervalMs !== 'number' || !Number.isFinite(pollIntervalMs) || pollIntervalMs < 100) throw new Error('asyncTask.pollIntervalMs must be at least 100.');
  if (timeoutMs !== null && (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new Error('asyncTask.timeoutMs must be positive or null.');
  if (maxPolls !== null && (typeof maxPolls !== 'number' || !Number.isInteger(maxPolls) || maxPolls <= 0)) throw new Error('asyncTask.maxPolls must be positive or null.');
  if (timeoutMs === undefined || maxPolls === undefined) throw new Error('asyncTask.timeoutMs and maxPolls are required.');
  return Object.freeze({ asyncTask: Object.freeze({ pollIntervalMs, timeoutMs: timeoutMs as number | null, maxPolls: maxPolls as number | null }) });
}

/** 远端优先解析运行时策略，远端不可用时回退到发布物默认值。 */
export async function resolveRuntimePolicy(options: { readonly remote?: RuntimePolicyRemoteSource } = {}): Promise<RuntimePolicyResolution> {
  if (!options.remote) return { policy: defaultRuntimePolicy, source: 'local' };
  try {
    return { policy: parseRuntimePolicy(await options.remote.load()), source: 'remote' };
  } catch (error) {
    return { policy: defaultRuntimePolicy, source: 'local', fallbackReason: error instanceof Error ? error.message : String(error) };
  }
}

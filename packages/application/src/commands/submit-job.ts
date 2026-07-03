/**
 * submitJob 命令实现。
 *
 * 提交一个 workflow 执行并等待结果。
 */

import type { Job, JobError } from '@imagen-ps/core-engine';
import { createRuntimeError } from '@imagen-ps/core-engine';
import { flushJobHistoryForTerminalJob, getProviderProfileRepository, getRuntime, getRuntimeLogger } from '../runtime.js';
import { noteProfileTaskBilling, scheduleProfileBalanceRefresh } from './profile-billing.js';
import type { CommandResult, SubmitJobInput } from './types.js';

/**
 * 判断 unknown 是否已携带 `JobError` 结构。
 */
function isJobError(error: unknown): error is JobError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as Partial<JobError>;
  return typeof candidate.category === 'string' && typeof candidate.message === 'string';
}

/**
 * 将执行期异常收敛为 `JobError`。
 *
 * - 若 error 已是 `JobError`，原样返回（保留原始 category）
 * - 若 error 是普通 `Error`，映射为 `category: 'runtime'`
 * - 其他情况，构造 `category: 'runtime'` 的 fallback
 */
export function toJobError(error: unknown): JobError {
  if (isJobError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createRuntimeError(error.message, {
      name: error.name,
      ...(error.stack ? { stack: error.stack } : {}),
    });
  }

  return createRuntimeError('Unknown error during job submission.', {
    cause: String(error),
  });
}

/**
 * 提交一个 workflow 执行并等待结果。
 *
 * 当 input 包含 `profileId` 或 `providerProfileId` 但没有显式 `provider` 字段时，
 * 自动注入 `provider: 'profile'`，将 dispatch 路由到 profile-aware adapter。
 *
 * @param input - 包含 workflow 名称与 job 输入
 * @returns 成功时 `{ ok: true, value: Job }`，失败时 `{ ok: false, error: JobError }`
 *
 * @example
 * 直接 provider 调用：
 * ```ts
 * const result = await submitJob({
 *   workflow: 'provider-generate',
 *   input: { provider: 'mock', prompt: 'a cat' },
 * });
 * ```
 *
 * @example
 * Profile-based dispatch（推荐）：
 * ```ts
 * const result = await submitJob({
 *   workflow: 'provider-generate',
 *   input: { profileId: 'my-profile', prompt: 'a cat' },
 * });
 * ```
 */
/** 内部字段：存储 workflow 名称以支持 retryJob */
export const WORKFLOW_NAME_KEY = '_workflowName';

/**
 * 判断 params 中是否存在 profile 标识字段。
 */
function hasProfileId(params: Record<string, unknown>): boolean {
  return 'profileId' in params || 'providerProfileId' in params;
}

/**
 * 判断 params 中是否显式指定了 provider。
 */
function hasExplicitProvider(params: Record<string, unknown>): boolean {
  return 'provider' in params;
}

export function profileIdFromInput(input: Record<string, unknown>): string | undefined {
  return typeof input.providerProfileId === 'string'
    ? input.providerProfileId
    : typeof input.profileId === 'string'
      ? input.profileId
      : undefined;
}

export async function noteExactTaskCost(job: Job, profileId: string): Promise<void> {
  if (job.status !== 'completed') {
    return;
  }
  const image = job.output?.image as { raw?: unknown } | undefined;
  const providerId = typeof job.input.provider === 'string' && job.input.provider !== 'profile'
    ? job.input.provider
    : (await getProviderProfileRepository().get(profileId))?.providerId;
  if (!providerId) {
    return;
  }
  const provider = getRuntime().providerRegistry.get(providerId);
  if (!provider || typeof provider.extractTaskCost !== 'function') {
    return;
  }
  const exactTaskCost = provider.extractTaskCost({
    assets: [],
    ...(image?.raw !== undefined ? { raw: image.raw } : {}),
  });
  if (!exactTaskCost) {
    return;
  }
  await noteProfileTaskBilling(profileId, { exactTaskCost });
}

export async function submitJob(input: SubmitJobInput): Promise<CommandResult<Job>> {
  const runtime = getRuntime();
  const profileId = profileIdFromInput(input.input);
  const commandLogger = (input.logger ?? getRuntimeLogger()).child({
    package: 'application',
    component: 'command',
    workflow: input.workflow,
    ...(profileId ? { profile_id: profileId } : {}),
  });
  const span = commandLogger.startSpan('command.submit');

  try {
    // Profile dispatch detection：当 input 包含 profileId 但没有显式 provider 时，
    // 自动注入 provider: 'profile'，路由到 createProfileAwareDispatchAdapter。
    const needsProfileDispatch = hasProfileId(input.input) && !hasExplicitProvider(input.input);

    // 在 input 中附加 workflow 名称，供 retryJob 使用
    const enrichedInput = {
      ...input.input,
      ...(needsProfileDispatch ? { provider: 'profile' } : {}),
      [WORKFLOW_NAME_KEY]: input.workflow,
    };
    const job = await runtime.runWorkflow(input.workflow, enrichedInput, {
      logger: commandLogger.child({ span_id: span.span_id }),
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    await flushJobHistoryForTerminalJob(job);
    if (profileId && (job.status === 'completed' || job.status === 'failed')) {
      await noteExactTaskCost(job, profileId);
      await scheduleProfileBalanceRefresh(profileId);
    }
    span.finish();
    return { ok: true, value: job };
  } catch (error) {
    span.fail(error);
    return { ok: false, error: toJobError(error) };
  }
}

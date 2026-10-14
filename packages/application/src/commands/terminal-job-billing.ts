import type { Job } from '@imagen-ps/core-engine';
import { getRuntime } from '../runtime.js';
import { noteProfileTaskBilling, scheduleProfileBalanceRefresh } from './profile-billing.js';

/**
 * 记录 terminal job 的精确费用，并继续安排 profile 级余额刷新。
 */
async function noteExactTaskCost(job: Job, profileId: string, implementationId: string): Promise<void> {
  const image = job.output?.image as { raw?: unknown } | undefined;
  if (!image || image.raw === undefined) {
    return;
  }
  const provider = getRuntime().providerRegistry.get(implementationId);
  if (!provider || typeof provider.extractTaskCost !== 'function') {
    return;
  }
  const exactTaskCost = provider.extractTaskCost({
    assets: [],
    raw: image.raw,
  });
  if (!exactTaskCost) {
    return;
  }
  await noteProfileTaskBilling(profileId, { exactTaskCost });
}

/**
 * 统一处理任务终态后的 billing follow-up。
 */
export async function runTerminalJobBillingFollowUp(
  job: Job,
  profileId: string,
  implementationId: string,
): Promise<void> {
  if (job.status !== 'completed' && job.status !== 'failed') {
    return;
  }
  try {
    await noteExactTaskCost(job, profileId, implementationId);
  } catch {
    // 精确费用属于附加观测，失败不得阻塞余额刷新或终态任务。
  }
  try {
    await scheduleProfileBalanceRefresh(profileId);
  } catch {
    // 余额刷新属于非阻塞 follow-up，失败不得改变任务结果。
  }
}

import type { Job } from '@imagen-ps/core-engine';
import { getProviderProfileRepository, getRuntime } from '../runtime.js';
import { noteProfileTaskBilling, scheduleProfileBalanceRefresh } from './profile-billing.js';

/**
 * 记录 terminal job 的精确费用，并继续安排 profile 级余额刷新。
 */
async function noteExactTaskCost(job: Job, profileId: string): Promise<void> {
  const image = job.output?.image as { raw?: unknown } | undefined;
  if (!image || image.raw === undefined) {
    return;
  }
  const profile = await getProviderProfileRepository().get(profileId);
  if (!profile) {
    return;
  }
  const provider = getRuntime().providerRegistry.getByApiFormat(profile.apiFormat);
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
export async function runTerminalJobBillingFollowUp(job: Job, profileId: string): Promise<void> {
  if (job.status !== 'completed' && job.status !== 'failed') {
    return;
  }
  await noteExactTaskCost(job, profileId);
  await scheduleProfileBalanceRefresh(profileId);
}

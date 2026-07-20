import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeError, type Job } from '@imagen-ps/core-engine';
import {
  _profileBillingStateCountsForTesting,
  _resetProfileBillingStateForTesting,
  getProfileBillingState,
} from './profile-billing.js';
import { runTerminalJobBillingFollowUp } from './terminal-job-billing.js';
import {
  _resetForTesting,
  _setRuntimeInstanceForTesting,
  setProviderProfileRepository,
} from '../runtime.js';

function terminalJob(status: 'completed' | 'failed'): Job {
  return {
    id: `job-${status}`,
    status,
    input: {},
    output: { image: { assets: [], raw: { usage: { total_cost: 0.02 } } } },
    error: status === 'failed' ? createRuntimeError('failed') : undefined,
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:02.000Z',
  };
}

function installRuntime() {
  const get = vi.fn((implementationId: string) => implementationId === 'image-endpoint'
    ? {
        id: 'image-endpoint',
        extractTaskCost: () => ({
          amount: '0.02',
          currency: 'USD',
          completeness: 'complete' as const,
        }),
      }
    : undefined);
  const getByApiFormat = vi.fn();
  _setRuntimeInstanceForTesting({
    providerRegistry: { list: () => [], get, getByApiFormat },
  } as never);
  setProviderProfileRepository({
    async list() { return []; },
    async get(profileId) {
      return profileId === 'billing-profile'
        ? {
            profileId,
            apiFormat: 'openai-images',
            displayName: 'Billing Profile',
            lifecycle: 'ready',
            config: {},
            createdAt: '2026-07-08T00:00:00.000Z',
            updatedAt: '2026-07-08T00:00:00.000Z',
          }
        : undefined;
    },
    async save() {},
    async delete() {},
  });
  return { get, getByApiFormat };
}

describe('terminal job billing follow-up', () => {
  beforeEach(() => {
    _resetForTesting();
    _resetProfileBillingStateForTesting();
  });

  it.each(['completed', 'failed'] as const)(
    'records exact cost for %s Job by admitted implementation id',
    async (status) => {
      const registry = installRuntime();
      await runTerminalJobBillingFollowUp(terminalJob(status), 'billing-profile', 'image-endpoint');

      const state = await getProfileBillingState('billing-profile');
      expect(state.ok ? state.value.lastExactTaskCost : undefined).toEqual({
        amount: '0.02',
        currency: 'USD',
        completeness: 'complete',
      });
      expect(_profileBillingStateCountsForTesting().scheduledRefreshEntries).toBe(1);
      expect(registry.get).toHaveBeenCalledWith('image-endpoint');
      expect(registry.getByApiFormat).not.toHaveBeenCalled();
    },
  );
});

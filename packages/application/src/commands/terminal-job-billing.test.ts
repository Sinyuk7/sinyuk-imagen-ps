import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeError, type Job } from '@imagen-ps/core-engine';
import { getProfileBillingState, _profileBillingStateCountsForTesting, _resetProfileBillingStateForTesting } from './profile-billing.js';
import { retryJob } from './retry-job.js';
import { submitJob } from './submit-job.js';
import { _resetForTesting, _setRuntimeInstanceForTesting, setProviderProfileRepository } from '../runtime.js';
import type { ProviderProfile, ProviderProfileRepository } from './types.js';

function createProfileRepository(initialProfiles: readonly ProviderProfile[]): ProviderProfileRepository {
  const store = new Map(initialProfiles.map((profile) => [profile.profileId, profile]));
  return {
    async list() {
      return Array.from(store.values());
    },
    async get(profileId) {
      return store.get(profileId);
    },
    async save(profile) {
      store.set(profile.profileId, profile);
    },
    async delete(profileId) {
      store.delete(profileId);
    },
  };
}

function createProfile(profileId = 'billing-profile'): ProviderProfile {
  return {
    profileId,
    apiFormat: 'openai-images',
    displayName: 'Billing Profile',
    enabled: true,
    config: {
      apiFormat: 'openai-images',
      displayName: 'Billing Profile',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{
          id: 'primary',
          url: 'https://billing.test/v1',
          enabled: true,
        }],
      },
      paths: {
        generation: '/images/generations',
      },
    },
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
  };
}

function installRuntime(args: {
  readonly runWorkflow: (workflow: string, input: Record<string, unknown>) => Promise<Job>;
  readonly sessionJob?: Job;
}): void {
  _setRuntimeInstanceForTesting({
    runWorkflow: args.runWorkflow,
    store: {
      getJob: vi.fn((jobId: string) => (args.sessionJob?.id === jobId ? args.sessionJob : undefined)),
    },
    providerRegistry: {
      list: () => [],
      get: () => undefined,
      getByApiFormat: () => ({
        id: 'image-endpoint',
        family: 'image-endpoint',
        describe: () => ({
          id: 'image-endpoint',
          family: 'image-endpoint',
          displayName: 'Image Endpoint',
          operations: ['text_to_image'],
          invokeMode: 'sync',
        }),
        validateConfig: (input: unknown) => input,
        validateRequest: (input: unknown) => input,
        invoke: async () => ({ assets: [] }),
        extractTaskCost: () => ({
          amount: '0.02',
          currency: 'USD',
          completeness: 'complete' as const,
        }),
      }),
    },
  } as never);
}

describe('terminal job billing follow-up', () => {
  beforeEach(() => {
    _resetForTesting();
    _resetProfileBillingStateForTesting();
  });

  it('submitJob records exact task cost and schedules one refresh entry', async () => {
    setProviderProfileRepository(createProfileRepository([createProfile()]));
    installRuntime({
      runWorkflow: async (_workflow, input) => ({
        id: 'job-submit-1',
        status: 'completed',
        input,
        output: {
          image: {
            assets: [],
            raw: { usage: { total_cost: 0.02 } },
          },
        },
        error: undefined,
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:02.000Z',
      }),
    });

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: 'billing-profile',
        prompt: 'silhouette of a cat',
      },
    });

    expect(result.ok).toBe(true);
    const state = await getProfileBillingState('billing-profile');
    expect(state.ok ? state.value.lastExactTaskCost : undefined).toEqual({
      amount: '0.02',
      currency: 'USD',
      completeness: 'complete',
    });
    expect(typeof (state.ok ? state.value.lastExactTaskCostObservedAt : undefined)).toBe('number');
    expect(_profileBillingStateCountsForTesting().scheduledRefreshEntries).toBe(1);
  });

  it('retryJob reuses shared follow-up for failed terminal jobs with raw billing evidence', async () => {
    setProviderProfileRepository(createProfileRepository([createProfile()]));
    const originalJob: Job = {
      id: 'job-original',
      status: 'failed',
      input: {
        profileId: 'billing-profile',
        _workflowName: 'provider-generate',
        prompt: 'retry me',
      },
      output: undefined,
      error: createRuntimeError('first attempt failed'),
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:01.000Z',
    };
    installRuntime({
      sessionJob: originalJob,
      runWorkflow: async (_workflow, input) => ({
        id: 'job-retry-1',
        status: 'failed',
        input,
        output: {
          image: {
            assets: [],
            raw: { usage: { total_cost: 0.02 } },
          },
        },
        error: createRuntimeError('second attempt failed'),
        createdAt: '2026-07-08T00:00:02.000Z',
        updatedAt: '2026-07-08T00:00:03.000Z',
      }),
    });

    const result = await retryJob('job-original');

    expect(result.ok).toBe(true);
    const state = await getProfileBillingState('billing-profile');
    expect(state.ok ? state.value.lastExactTaskCost : undefined).toEqual({
      amount: '0.02',
      currency: 'USD',
      completeness: 'complete',
    });
    expect(typeof (state.ok ? state.value.lastExactTaskCostObservedAt : undefined)).toBe('number');
    expect(_profileBillingStateCountsForTesting().scheduledRefreshEntries).toBe(1);
  });
});

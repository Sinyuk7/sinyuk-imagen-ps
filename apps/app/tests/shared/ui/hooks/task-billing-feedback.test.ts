import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileBillingState } from '@imagen-ps/application';
import { resolveTaskBillingFeedback } from '../../../../src/shared/ui/hooks/task-billing-feedback';

function createCommands(states: readonly (ProfileBillingState | null)[]) {
  let callCount = 0;
  return {
    getProfileBillingState: vi.fn(async () => {
      const state = states[Math.min(callCount, states.length - 1)] ?? null;
      callCount += 1;
      if (!state) {
        return {
          ok: false as const,
          error: { category: 'provider', message: 'billing unavailable' },
        };
      }
      return { ok: true as const, value: state };
    }),
  };
}

describe('task billing feedback resolver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefers fresh exact task cost immediately', async () => {
    const commands = createCommands([{
      refreshState: 'refreshing',
      lastExactTaskCost: {
        amount: '0.02',
        currency: 'USD',
        completeness: 'complete',
      },
      lastExactTaskCostObservedAt: 20,
    }]);

    const feedback = await resolveTaskBillingFeedback({
      commands,
      profileId: 'profile-1',
      baseline: {
        refreshState: 'idle',
        lastExactTaskCost: {
          amount: '0.02',
          currency: 'USD',
          completeness: 'complete',
        },
        lastExactTaskCostObservedAt: 10,
      },
      balanceSupported: false,
    });

    expect(feedback).toEqual({
      kind: 'cost',
      cost: {
        amount: '0.02',
        currency: 'USD',
        completeness: 'complete',
      },
    });
  });

  it('falls back to async balance-change observation when exact cost is absent', async () => {
    vi.useFakeTimers();
    const commands = createCommands([
      {
        refreshState: 'refreshing',
        balance: {
          profileId: 'profile-1',
          apiFormat: 'openai-chat-completions',
          checkedAt: 100,
          snapshot: { primary: { kind: 'money', remaining: '12.00', currency: 'USD' } },
        },
      },
      {
        refreshState: 'refreshing',
        balance: {
          profileId: 'profile-1',
          apiFormat: 'openai-chat-completions',
          checkedAt: 100,
          snapshot: { primary: { kind: 'money', remaining: '12.00', currency: 'USD' } },
        },
      },
      {
        refreshState: 'idle',
        balance: {
          profileId: 'profile-1',
          apiFormat: 'openai-chat-completions',
          checkedAt: 220,
          snapshot: { primary: { kind: 'money', remaining: '11.98', currency: 'USD' } },
        },
        lastBalanceChange: {
          amount: '0.02',
          unit: 'USD',
          direction: 'decreased',
        },
        lastBalanceChangeObservedAt: 220,
      },
    ]);

    const feedbackPromise = resolveTaskBillingFeedback({
      commands,
      profileId: 'profile-1',
      baseline: {
        refreshState: 'idle',
        balance: {
          profileId: 'profile-1',
          apiFormat: 'openai-chat-completions',
          checkedAt: 90,
          snapshot: { primary: { kind: 'money', remaining: '12.00', currency: 'USD' } },
        },
      },
      balanceSupported: true,
    });

    await vi.advanceTimersByTimeAsync(120);
    const feedback = await feedbackPromise;

    expect(feedback).toEqual({
      kind: 'balance-change',
      change: {
        amount: '0.02',
        unit: 'USD',
        direction: 'decreased',
      },
    });
  });

  it('supports quota-based balance-change fallback when exact cost is absent', async () => {
    vi.useFakeTimers();
    const commands = createCommands([
      {
        refreshState: 'refreshing',
        balance: {
          profileId: 'profile-1',
          apiFormat: 'openai-chat-completions',
          checkedAt: 100,
          snapshot: { primary: { kind: 'quota', remaining: '10', unit: 'credits' } },
        },
      },
      {
        refreshState: 'idle',
        balance: {
          profileId: 'profile-1',
          apiFormat: 'openai-chat-completions',
          checkedAt: 220,
          snapshot: { primary: { kind: 'quota', remaining: '8', unit: 'credits' } },
        },
        lastBalanceChange: {
          amount: '2',
          unit: 'credits',
          direction: 'decreased',
        },
        lastBalanceChangeObservedAt: 220,
      },
    ]);

    const feedbackPromise = resolveTaskBillingFeedback({
      commands,
      profileId: 'profile-1',
      baseline: {
        refreshState: 'idle',
        balance: {
          profileId: 'profile-1',
          apiFormat: 'openai-chat-completions',
          checkedAt: 90,
          snapshot: { primary: { kind: 'quota', remaining: '10', unit: 'credits' } },
        },
      },
      balanceSupported: true,
    });

    await vi.advanceTimersByTimeAsync(120);
    const feedback = await feedbackPromise;

    expect(feedback).toEqual({
      kind: 'balance-change',
      change: {
        amount: '2',
        unit: 'credits',
        direction: 'decreased',
      },
    });
  });

  it('returns null when fallback refresh ends without a fresh billing signal', async () => {
    vi.useFakeTimers();
    const commands = createCommands([
      { refreshState: 'refreshing' },
      { refreshState: 'refreshing' },
      { refreshState: 'idle' },
    ]);

    const feedbackPromise = resolveTaskBillingFeedback({
      commands,
      profileId: 'profile-1',
      baseline: { refreshState: 'idle' },
      balanceSupported: true,
    });

    await vi.advanceTimersByTimeAsync(120);
    const feedback = await feedbackPromise;

    expect(feedback).toBeNull();
  });

  it('returns null when observation is aborted before the refresh window settles', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const commands = createCommands([
      { refreshState: 'refreshing' },
      {
        refreshState: 'idle',
        lastBalanceChange: {
          amount: '1',
          unit: 'USD',
          direction: 'decreased',
        },
        lastBalanceChangeObservedAt: 220,
      },
    ]);

    const feedbackPromise = resolveTaskBillingFeedback({
      commands,
      profileId: 'profile-1',
      baseline: { refreshState: 'idle' },
      balanceSupported: true,
      signal: controller.signal,
    });
    controller.abort();

    await vi.advanceTimersByTimeAsync(120);
    const feedback = await feedbackPromise;

    expect(feedback).toBeNull();
  });
});

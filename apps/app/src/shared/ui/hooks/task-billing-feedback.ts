import type { BalanceChange, ExactTaskCost, ProfileBillingState } from '@imagen-ps/application';
import type { CommandsPort } from '../../ports/commands-port';

const BILLING_REFRESH_POLL_ATTEMPTS = 12;
const BILLING_REFRESH_POLL_DELAY_MS = 120;

export type TaskBillingFeedback =
  | { readonly kind: 'cost'; readonly cost: ExactTaskCost }
  | { readonly kind: 'balance-change'; readonly change: BalanceChange };

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function observedAt(
  state: ProfileBillingState | null | undefined,
  kind: 'cost' | 'balance-change',
): number | undefined {
  return kind === 'cost' ? state?.lastExactTaskCostObservedAt : state?.lastBalanceChangeObservedAt;
}

function hasFreshExactTaskCost(
  state: ProfileBillingState | null,
  baseline: ProfileBillingState | null,
): state is ProfileBillingState & { readonly lastExactTaskCost: ExactTaskCost } {
  return state?.lastExactTaskCost !== undefined && (observedAt(state, 'cost') ?? 0) > (observedAt(baseline, 'cost') ?? 0);
}

function hasFreshBalanceChange(
  state: ProfileBillingState | null,
  baseline: ProfileBillingState | null,
): state is ProfileBillingState & { readonly lastBalanceChange: BalanceChange } {
  return state?.lastBalanceChange !== undefined
    && (observedAt(state, 'balance-change') ?? 0) > (observedAt(baseline, 'balance-change') ?? 0);
}

export async function getProfileBillingStateOrNull(
  commands: Pick<CommandsPort, 'getProfileBillingState'>,
  profileId: string,
): Promise<ProfileBillingState | null> {
  const result = await commands.getProfileBillingState(profileId);
  return result.ok ? result.value : null;
}

export async function resolveTaskBillingFeedback(input: {
  readonly commands: Pick<CommandsPort, 'getProfileBillingState'>;
  readonly profileId: string;
  readonly baseline: ProfileBillingState | null;
  readonly balanceSupported: boolean;
}): Promise<TaskBillingFeedback | null> {
  const currentState = await getProfileBillingStateOrNull(input.commands, input.profileId);
  if (hasFreshExactTaskCost(currentState, input.baseline)) {
    return { kind: 'cost', cost: currentState.lastExactTaskCost };
  }
  if (hasFreshBalanceChange(currentState, input.baseline)) {
    return { kind: 'balance-change', change: currentState.lastBalanceChange };
  }
  if (!input.balanceSupported) {
    return null;
  }

  let sawRefreshing = currentState?.refreshState === 'refreshing';
  for (let attempt = 0; attempt < BILLING_REFRESH_POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await pause(BILLING_REFRESH_POLL_DELAY_MS);
    }
    const nextState = await getProfileBillingStateOrNull(input.commands, input.profileId);
    if (!nextState) {
      continue;
    }
    if (hasFreshExactTaskCost(nextState, input.baseline)) {
      return { kind: 'cost', cost: nextState.lastExactTaskCost };
    }
    if (hasFreshBalanceChange(nextState, input.baseline)) {
      return { kind: 'balance-change', change: nextState.lastBalanceChange };
    }
    if (nextState.refreshState === 'refreshing') {
      sawRefreshing = true;
      continue;
    }
    if (sawRefreshing) {
      return null;
    }
  }

  return null;
}

import type { BalanceChange, ExactTaskCost, ProfileBillingState } from '@imagen-ps/application';
import type { CommandsPort } from '../../ports/commands-port';

const BILLING_REFRESH_POLL_ATTEMPTS = 12;
const BILLING_REFRESH_POLL_DELAY_MS = 120;

export type TaskBillingFeedback =
  | { readonly kind: 'cost'; readonly cost: ExactTaskCost }
  | { readonly kind: 'balance-change'; readonly change: BalanceChange };

export interface ProfileBillingObservation {
  readonly state: ProfileBillingState | null;
  readonly feedback: TaskBillingFeedback | null;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
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

function feedbackFromState(
  state: ProfileBillingState | null,
  baseline: ProfileBillingState | null,
): TaskBillingFeedback | null {
  if (hasFreshExactTaskCost(state, baseline)) {
    return { kind: 'cost', cost: state.lastExactTaskCost };
  }
  if (hasFreshBalanceChange(state, baseline)) {
    return { kind: 'balance-change', change: state.lastBalanceChange };
  }
  return null;
}

export async function observeProfileBillingRefresh(input: {
  readonly commands: Pick<CommandsPort, 'getProfileBillingState'>;
  readonly profileId: string;
  readonly baseline: ProfileBillingState | null;
  readonly balanceSupported: boolean;
  readonly signal?: AbortSignal;
}): Promise<ProfileBillingObservation | null> {
  if (isAborted(input.signal)) {
    return null;
  }
  const currentState = await getProfileBillingStateOrNull(input.commands, input.profileId);
  const currentFeedback = feedbackFromState(currentState, input.baseline);
  if (currentFeedback) {
    return { state: currentState, feedback: currentFeedback };
  }
  if (!input.balanceSupported) {
    return { state: currentState, feedback: null };
  }

  let latestState = currentState;
  let sawRefreshing = currentState?.refreshState === 'refreshing';
  for (let attempt = 0; attempt < BILLING_REFRESH_POLL_ATTEMPTS; attempt += 1) {
    if (isAborted(input.signal)) {
      return null;
    }
    if (attempt > 0) {
      await pause(BILLING_REFRESH_POLL_DELAY_MS);
    }
    if (isAborted(input.signal)) {
      return null;
    }
    const nextState = await getProfileBillingStateOrNull(input.commands, input.profileId);
    if (!nextState) {
      continue;
    }
    latestState = nextState;
    const nextFeedback = feedbackFromState(nextState, input.baseline);
    if (nextFeedback) {
      return { state: nextState, feedback: nextFeedback };
    }
    if (nextState.refreshState === 'refreshing') {
      sawRefreshing = true;
      continue;
    }
    if (sawRefreshing) {
      return { state: nextState, feedback: null };
    }
  }

  return { state: latestState, feedback: null };
}

export async function resolveTaskBillingFeedback(input: {
  readonly commands: Pick<CommandsPort, 'getProfileBillingState'>;
  readonly profileId: string;
  readonly baseline: ProfileBillingState | null;
  readonly balanceSupported: boolean;
  readonly signal?: AbortSignal;
}): Promise<TaskBillingFeedback | null> {
  const observation = await observeProfileBillingRefresh(input);
  return observation?.feedback ?? null;
}

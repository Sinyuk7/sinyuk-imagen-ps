import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ProviderDescriptor, ProviderProfile, ProfileBillingState } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import { formatBalanceChange, formatExactTaskCost } from '../../domain/mappers';
import type { ConversationRound, RoundStatus } from './use-conversation';
import { observeProfileBillingRefresh, getProfileBillingStateOrNull, type TaskBillingFeedback } from './task-billing-feedback';
import { descriptorForApiFormat, providerSupportsBalanceQuery } from './use-provider-settings';
import type { ToastController } from '../components/toast-host';
import type { AppMessages } from '../i18n/messages';

interface PendingTaskBillingToast {
  readonly profileId: string;
  readonly baselinePromise: Promise<ProfileBillingState | null>;
}

function toastMessage(messages: AppMessages, providerName: string, feedback: TaskBillingFeedback): string | undefined {
  if (feedback.kind === 'cost') {
    const formatted = formatExactTaskCost(feedback.cost);
    return formatted ? `${providerName} · ${messages.main.billingCost}: ${formatted}` : undefined;
  }
  const formatted = formatBalanceChange(feedback.change);
  return formatted ? `${providerName} · ${messages.main.billingObservedChange}: ${formatted}` : undefined;
}

export function useTaskBillingToast(input: {
  readonly services: AppServices;
  readonly rounds: readonly ConversationRound[];
  readonly profiles: readonly ProviderProfile[];
  readonly providers: readonly ProviderDescriptor[];
  readonly show: ToastController['show'];
  readonly messages: AppMessages;
  readonly onObservedState?: (profileId: string, state: ProfileBillingState) => void;
}): void {
  const initializedRef = useRef(false);
  const previousStatusesRef = useRef<Record<string, RoundStatus>>({});
  const pendingRef = useRef<Record<string, PendingTaskBillingToast>>({});
  const observationControllersRef = useRef<Record<string, AbortController>>({});
  const onObservedStateRef = useRef(input.onObservedState);

  useEffect(() => {
    onObservedStateRef.current = input.onObservedState;
  }, [input.onObservedState]);

  const billingSupportByProfileId = useMemo(() => new Map(
    input.profiles.map((profile) => [
      profile.profileId,
      providerSupportsBalanceQuery(descriptorForApiFormat(input.providers, profile.apiFormat), profile),
    ]),
  ), [input.profiles, input.providers]);

  const observeTerminalRound = useCallback(async (round: ConversationRound, pending: PendingTaskBillingToast) => {
    const abortController = new AbortController();
    observationControllersRef.current[round.id] = abortController;
    const baseline = await pending.baselinePromise;
    const observation = await observeProfileBillingRefresh({
      commands: input.services.commands,
      profileId: pending.profileId,
      baseline,
      balanceSupported: billingSupportByProfileId.get(pending.profileId) ?? false,
      signal: abortController.signal,
    });
    if (observationControllersRef.current[round.id] === abortController) {
      delete observationControllersRef.current[round.id];
    }
    if (abortController.signal.aborted || !observation) {
      return;
    }
    if (observation.state && onObservedStateRef.current) {
      onObservedStateRef.current(pending.profileId, observation.state);
    }
    const feedback = observation.feedback;
    if (!feedback) {
      return;
    }
    const message = toastMessage(input.messages, round.providerName, feedback);
    if (!message) {
      return;
    }
    input.show(message, 'info', { key: `task-billing:${round.id}` });
  }, [billingSupportByProfileId, input.messages, input.services.commands, input.show]);

  useEffect(() => {
    const liveRoundIds = new Set(input.rounds.map((round) => round.id));
    for (const roundId of Object.keys(pendingRef.current)) {
      if (!liveRoundIds.has(roundId)) {
        delete pendingRef.current[roundId];
      }
    }
    for (const [roundId, controller] of Object.entries(observationControllersRef.current)) {
      if (!liveRoundIds.has(roundId)) {
        controller.abort();
        delete observationControllersRef.current[roundId];
      }
    }

    for (const round of input.rounds) {
      if (round.status !== 'running' || !round.profileId || pendingRef.current[round.id] !== undefined) {
        continue;
      }
      pendingRef.current[round.id] = {
        profileId: round.profileId,
        baselinePromise: getProfileBillingStateOrNull(input.services.commands, round.profileId),
      };
    }

    const nextStatuses: Record<string, RoundStatus> = {};
    const terminalRounds: Array<{ readonly round: ConversationRound; readonly pending: PendingTaskBillingToast }> = [];
    for (const round of input.rounds) {
      nextStatuses[round.id] = round.status;
      if (!initializedRef.current || !round.profileId) {
        continue;
      }
      const previousStatus = previousStatusesRef.current[round.id];
      if (
        (previousStatus !== 'running' && previousStatus !== undefined)
        || (round.status !== 'ok' && round.status !== 'err')
      ) {
        continue;
      }
      const pending = pendingRef.current[round.id] ?? {
        profileId: round.profileId,
        baselinePromise: Promise.resolve<ProfileBillingState | null>(null),
      };
      delete pendingRef.current[round.id];
      terminalRounds.push({ round, pending });
    }

    previousStatusesRef.current = nextStatuses;
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    for (const { round, pending } of terminalRounds) {
      void observeTerminalRound(round, pending);
    }
  }, [input.rounds, input.services.commands, observeTerminalRound]);

  useEffect(() => () => {
    for (const controller of Object.values(observationControllersRef.current)) {
      controller.abort();
    }
    observationControllersRef.current = {};
  }, []);
}

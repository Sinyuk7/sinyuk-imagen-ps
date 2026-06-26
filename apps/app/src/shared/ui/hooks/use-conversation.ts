import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobError, JobSessionSnapshot } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import {
  assetToPreview,
  commandErrorToMessage,
  outputAssets,
  outputMetadata,
  type AssetPreview,
} from '../../domain/mappers';
import type { ImagenSessionBinding } from './use-imagen-session';
import type { AppMessages } from '../i18n/messages';
import type { HostImageAsset } from '../../domain/host-image-asset';

export interface ConversationAttachment {
  readonly id: string;
  readonly type: 'layer' | 'file';
  readonly name: string;
  readonly image: HostImageAsset;
  readonly previewUrl: string;
}

export type RoundStatus = 'running' | 'ok' | 'err';

export interface ConversationRound {
  readonly id: string;
  readonly time: string;
  readonly prompt: string;
  readonly status: RoundStatus;
  readonly providerName: string;
  readonly elapsedSeconds: number;
  readonly elapsedLabel?: string;
  readonly errorMessage?: string;
  readonly jobId?: string;
  readonly profileId?: string;
  readonly modelId?: string;
  readonly previews: readonly AssetPreview[];
  readonly attachments: readonly ConversationAttachment[];
  readonly outputSize?: string;
  readonly outputFormat?: string;
}

export interface SubmitConversationInput {
  readonly prompt: string;
  readonly profileId: string;
  readonly providerName: string;
  readonly modelId?: string;
  readonly attachments?: readonly ConversationAttachment[];
}

export interface ConversationController {
  readonly rounds: readonly ConversationRound[];
  readonly running: boolean;
  readonly submit: (input: SubmitConversationInput) => Promise<void>;
  readonly retry: (roundId: string) => Promise<void>;
  readonly clear: () => void;
}

export interface ConversationMessages {
  readonly jobFailed: string;
}

const DEFAULT_CONVERSATION_MESSAGES: ConversationMessages = { jobFailed: 'Job failed.' };

function nowTime(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function createRoundId(): string {
  return `round-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function elapsedLabel(seconds: number): string {
  return seconds < 1 ? '0s' : `${seconds}s`;
}

function isJobError(error: unknown): error is JobError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Partial<JobError>).category === 'string' &&
    typeof (error as Partial<JobError>).message === 'string'
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return isJobError(error) ? commandErrorToMessage(error) : fallback;
}

function roundFromSessionJob(
  job: JobSessionSnapshot,
  current: ConversationRound,
  messages: ConversationMessages,
): ConversationRound {
  const assets = outputAssets(job.output);
  const metadata = outputMetadata(job.output);
  if (job.status === 'failed') {
    return {
      ...current,
      status: 'err',
      jobId: job.id,
      errorMessage: errorMessage(job.error, messages.jobFailed),
      elapsedLabel: elapsedLabel(current.elapsedSeconds),
    };
  }
  if (job.status !== 'completed') {
    return {
      ...current,
      status: 'running',
      jobId: job.id,
    };
  }
  return {
    ...current,
    status: 'ok',
    jobId: job.id,
    previews: assets.map(assetToPreview),
    elapsedLabel: elapsedLabel(current.elapsedSeconds),
    ...(metadata?.size ? { outputSize: metadata.size } : {}),
    ...(metadata?.outputFormat ? { outputFormat: metadata.outputFormat } : {}),
  };
}

function jobSnapshotFromResult(
  jobId: string,
  workflow: 'provider-generate' | 'provider-edit' | string,
  status: string,
  output: unknown,
  error: unknown,
): JobSessionSnapshot {
  return {
    id: jobId,
    type: workflow === 'provider-edit' ? 'edit' : workflow === 'provider-generate' ? 'generate' : workflow,
    status,
    phase: status,
    canRetry: status === 'failed',
    canCancel: false,
    ...(output !== undefined ? { output } : {}),
    ...(error !== undefined ? { error } : {}),
  };
}

function errorRound(current: ConversationRound, error: JobError | Error): ConversationRound {
  return {
    ...current,
    status: 'err',
    errorMessage: error instanceof Error ? error.message : commandErrorToMessage(error),
    elapsedLabel: elapsedLabel(current.elapsedSeconds),
  };
}

export function useConversation(
  _services: AppServices,
  sessionBinding: ImagenSessionBinding,
  messages: ConversationMessages | AppMessages['conversation'] = DEFAULT_CONVERSATION_MESSAGES,
): ConversationController {
  const [rounds, setRounds] = useState<readonly ConversationRound[]>([]);
  const running = useMemo(() => rounds.some((round) => round.status === 'running'), [rounds]);

  /**
   * UI 同步 ref 门禁（交互反馈层，非唯一权威）。
   *
   * - `submitInFlightRef`：交互宿主单 in-flight contract —— 在 React 状态更新前封住
   *   同 tick 的 send/regenerate 双击窗口。session 层 in-flight registry 是权威边界。
   * - `retryInFlightRef`：按 roundId 封住同一 round 的同 tick retry burst。
   *
   * 使用 useRef（同步）而非 state，确保在异步 session 调用前即生效。
   */
  const submitInFlightRef = useRef(false);
  const retryInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = window.setInterval(() => {
      setRounds((current) =>
        current.map((round) =>
          round.status === 'running' ? { ...round, elapsedSeconds: round.elapsedSeconds + 1 } : round,
        ),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    setRounds((current) =>
      current.map((round) => {
        const sessionJob = sessionBinding.snapshot.jobs.find((job) => job.id === round.jobId);
        return sessionJob ? roundFromSessionJob(sessionJob, round, messages) : round;
      }),
    );
  }, [messages, sessionBinding.snapshot.jobs]);

  const submit = useCallback(
    async (input: SubmitConversationInput) => {
      const prompt = input.prompt.trim();
      if (!prompt) {
        return;
      }

      // 同 tick 门禁：封住 React 状态更新前的 send/regenerate 双击窗口。
      if (submitInFlightRef.current) {
        return;
      }
      submitInFlightRef.current = true;

      try {
        const roundId = createRoundId();
        const attachments = input.attachments ?? [];
        const round: ConversationRound = {
          id: roundId,
          time: nowTime(),
          prompt,
          status: 'running',
          providerName: input.providerName,
          profileId: input.profileId,
          ...(input.modelId ? { modelId: input.modelId } : {}),
          elapsedSeconds: 0,
          previews: [],
          attachments,
        };
        setRounds((current) => [...current, round]);

        const providerOptions = input.modelId ? { model: input.modelId } : undefined;
        const workflow = attachments.length > 0 ? 'provider-edit' : 'provider-generate';
        const jobInput = {
          __clientRoundId: roundId,
          profileId: input.profileId,
          prompt,
          output: { count: 1 },
          ...(providerOptions ? { providerOptions } : {}),
          ...(attachments.length > 0 ? { images: attachments.map((attachment) => attachment.image.asset) } : {}),
        };

        try {
          const result = await sessionBinding.session.submitJob({
            workflow,
            input: jobInput,
          });

          setRounds((current) =>
            current.map((item) => {
              if (item.id !== roundId) {
                return item;
              }
              return result.ok
                ? roundFromSessionJob(
                    sessionBinding.snapshot.jobs.find((job) => job.id === result.value.id) ??
                      jobSnapshotFromResult(
                        result.value.id,
                        workflow,
                        result.value.status,
                        result.value.output,
                        result.value.error,
                      ),
                    item,
                    messages,
                  )
                : errorRound(item, result.error);
            }),
          );
        } catch (error) {
          setRounds((current) =>
            current.map((item) =>
              item.id === roundId ? errorRound(item, error instanceof Error ? error : new Error(String(error))) : item,
            ),
          );
        }
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [messages, sessionBinding.session, sessionBinding.snapshot.jobs],
  );

  const retry = useCallback(
    async (roundId: string) => {
      // 同 tick 门禁：封住同一 round 的 regenerate / error-retry burst。
      if (retryInFlightRef.current.has(roundId)) {
        return;
      }
      retryInFlightRef.current.add(roundId);
      try {
        const round = rounds.find((item) => item.id === roundId);
        if (round?.status === 'ok' && round.profileId) {
          await submit({
            prompt: round.prompt,
            profileId: round.profileId,
            providerName: round.providerName,
            ...(round.modelId ? { modelId: round.modelId } : {}),
            attachments: round.attachments,
          });
          return;
        }
        if (!round?.jobId) {
          return;
        }
        setRounds((current) =>
          current.map((item) => (item.id === roundId ? { ...item, status: 'running', elapsedSeconds: 0 } : item)),
        );
        const result = await sessionBinding.session.retryJob(round.jobId);
        setRounds((current) =>
          current.map((item) => {
            if (item.id !== roundId) {
              return item;
            }
            return result.ok
              ? roundFromSessionJob(
                  sessionBinding.snapshot.jobs.find((job) => job.id === result.value.id) ??
                    jobSnapshotFromResult(
                      result.value.id,
                      String(result.value.input._workflowName ?? 'provider-generate'),
                      result.value.status,
                      result.value.output,
                      result.value.error,
                    ),
                  item,
                  messages,
                )
              : errorRound(item, result.error);
          }),
        );
      } finally {
        retryInFlightRef.current.delete(roundId);
      }
    },
    [messages, rounds, sessionBinding.session, sessionBinding.snapshot.jobs, submit],
  );

  const clear = useCallback(() => setRounds([]), []);

  return {
    rounds,
    running,
    submit,
    retry,
    clear,
  };
}

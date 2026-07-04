import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiFormat, JobError, JobSessionSnapshot } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import {
  commandErrorToMessage,
  assetToPreview,
  outputAssets,
  outputMetadata,
  outputText,
  type AssetPreview,
} from '../../domain/mappers';
import { createMemoryThumbnailStore, type ThumbnailStore } from '../../image/thumbnail-store';
import type { ImagenSessionBinding } from './use-imagen-session';
import type { AppMessages } from '../i18n/messages';
import type { HostImageAsset } from '../../domain/host-image-asset';
import {
  placementIntentFromCapturePlacement,
  type PlacementIntent,
  type PhotoshopCapturePlacement,
} from '../../domain/photoshop-placement';
import type { Asset } from '@imagen-ps/application';
import { createRunningTaskRecord } from '../../domain/task-snapshot';
import type { AppGenerationSettings, AppProviderInputSizePreset } from '../../ports/app-generation-settings';

export interface ConversationAttachment {
  readonly id: string;
  readonly type: 'layer' | 'file' | 'photoshop-capture';
  readonly name: string;
  readonly image: HostImageAsset;
  readonly previewUrl: string;
  readonly photoshopPlacement?: PhotoshopCapturePlacement;
}

export type RoundStatus = 'running' | 'ok' | 'err';

export interface ConversationRound {
  readonly id: string;
  readonly time: string;
  readonly createdAt?: string;
  readonly prompt: string;
  readonly status: RoundStatus;
  readonly providerName: string;
  readonly apiFormat?: ApiFormat;
  readonly providerId?: string;
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
  readonly responseText?: string;
  readonly providerInputSizePreset?: AppProviderInputSizePreset;
  readonly placementIntent: PlacementIntent;
  readonly output?: AppGenerationSettingsOutput;
}

export interface SubmitConversationInput {
  readonly operation: 'image-edit' | 'text-to-image';
  readonly prompt: string;
  readonly profileId: string;
  readonly providerId?: string;
  readonly apiFormat?: ApiFormat;
  readonly providerName: string;
  readonly modelId?: string;
  readonly attachments?: readonly ConversationAttachment[];
  readonly output?: AppGenerationSettingsOutput;
  readonly providerInputSizePreset?: AppProviderInputSizePreset;
}

export interface AppGenerationSettingsOutput {
  readonly count: 1;
  readonly sizePreset: AppGenerationSettings['outputSizePreset'];
  readonly outputFormat: AppGenerationSettings['outputFormat'];
  readonly aspectRatio: AppGenerationSettings['aspectRatio'];
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

const DEFAULT_CONVERSATION_MESSAGES: ConversationMessages = { jobFailed: 'Task failed.' };

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

const fallbackThumbnailStore = createMemoryThumbnailStore();

function thumbnailStoreFrom(services: AppServices): ThumbnailStore {
  return services.thumbnails ?? fallbackThumbnailStore;
}

function pendingPreviews(assets: readonly Asset[]): readonly AssetPreview[] {
  return assets.map(assetToPreview);
}

function previewAssetSourceKey(asset: Asset, index: number): string {
  return asset.storedRef?.ref ?? asset.url ?? asset.fileId ?? asset.name ?? String(index);
}

function previewWorkSignature(
  rounds: readonly ConversationRound[],
  jobs: readonly JobSessionSnapshot[],
): string {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const parts: string[] = [];
  for (const round of rounds) {
    if (
      round.status !== 'ok' ||
      !round.jobId ||
      round.previews.length === 0 ||
      round.previews.every((preview) => preview.url)
    ) {
      continue;
    }
    const job = jobsById.get(round.jobId);
    const assets = job ? outputAssets(job.output) : round.previews.map((preview) => preview.asset);
    if (assets.length === 0) {
      continue;
    }
    parts.push(`${round.id}:${round.jobId}:${assets.map(previewAssetSourceKey).join(',')}`);
  }
  return parts.join('|');
}

function releaseAttachment(attachment: ConversationAttachment): void {
  attachment.image.preview.dispose?.();
}

function releaseAttachments(attachments: readonly ConversationAttachment[]): void {
  const released = new Set<HostImageAsset>();
  for (const attachment of attachments) {
    if (released.has(attachment.image)) {
      continue;
    }
    released.add(attachment.image);
    releaseAttachment(attachment);
  }
}

function roundFromSessionJob(
  job: JobSessionSnapshot,
  current: ConversationRound,
  messages: ConversationMessages,
): ConversationRound {
  const assets = outputAssets(job.output);
  const metadata = outputMetadata(job.output);
  const responseText = composeResponseText(outputText(job.output), current);
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
    previews:
      current.status === 'ok' && current.previews.length === assets.length && current.previews.every((preview) => preview.url)
        ? current.previews
        : pendingPreviews(assets),
    elapsedLabel: elapsedLabel(current.elapsedSeconds),
    ...(metadata?.size ? { outputSize: metadata.size } : {}),
    ...(metadata?.outputFormat ? { outputFormat: metadata.outputFormat } : {}),
    ...(responseText ? { responseText } : {}),
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

function attachmentSummary(attachments: readonly ConversationAttachment[]): string {
  if (attachments.length === 0) {
    return '0';
  }
  const counts = new Map<ConversationAttachment['type'], number>();
  for (const attachment of attachments) {
    counts.set(attachment.type, (counts.get(attachment.type) ?? 0) + 1);
  }
  const types = Array.from(counts.entries()).map(([type, count]) => `${type}:${count}`).join(',');
  return `${attachments.length} types=${types}`;
}

function placementSummary(intent: PlacementIntent): readonly string[] {
  const lines = [`app.placement=${intent.kind}`];
  if (intent.kind === 'exact-frame' || intent.kind === 'document-only') {
    lines.push(`app.documentId=${intent.documentId}`);
    if (intent.documentName !== undefined) {
      lines.push(`app.documentName=${intent.documentName}`);
    }
    lines.push(`app.documentSizeAtCapture=${intent.documentSizeAtCapture.width}x${intent.documentSizeAtCapture.height}`);
  }
  if (intent.kind === 'exact-frame') {
    const rect = intent.placementRect;
    lines.push(`app.placementRect=${rect.left},${rect.top},${rect.right},${rect.bottom}`);
  }
  return lines;
}

function contextToken(line: string): string {
  return `[${line}]`;
}

function composeMockAppContext(round: ConversationRound): string {
  const output = round.output;
  return [
    `app.model=${round.modelId ?? 'default'}`,
    `app.output=size=${output?.sizePreset ?? 'default'} format=${output?.outputFormat ?? 'default'} aspect=${output?.aspectRatio ?? 'default'} providerInputSize=${round.providerInputSizePreset ?? 'default'}`,
    `app.attachments=${attachmentSummary(round.attachments)}`,
    ...placementSummary(round.placementIntent),
  ].map(contextToken).join(' ');
}

function composeResponseText(providerText: string | undefined, round: ConversationRound): string | undefined {
  if (providerText === undefined) {
    return undefined;
  }
  if (round.providerId !== 'mock') {
    return providerText;
  }
  return `${providerText} ${composeMockAppContext(round)}`;
}

function assetForJobInput(image: HostImageAsset): Asset {
  const providerInput = image.resource.derivatives.providerInput;
  const storedRef = providerInput?.storedRef;
  if (providerInput?.kind !== 'ready' || storedRef === undefined) {
    throw new Error(`Provider input derivative is not ready for image "${image.metadata.name ?? image.asset.name ?? image.resource.id}".`);
  }

  const name = storedRef.name ?? image.asset.name ?? image.metadata.name;
  const mimeType = providerInput.mimeType ?? storedRef.mimeType ?? image.asset.mimeType ?? image.metadata.mimeType;
  return {
    type: image.asset.type,
    ...(name ? { name } : {}),
    ...(mimeType ? { mimeType } : {}),
    storedRef,
  };
}

export function derivePlacementIntent(attachments: readonly ConversationAttachment[]): PlacementIntent {
  const captures = attachments.filter((attachment) => attachment.photoshopPlacement !== undefined);
  if (captures.length === 0) {
    return { kind: 'unbound', reason: 'no-photoshop-capture' };
  }

  const documentIds = new Set(captures.map((attachment) => attachment.photoshopPlacement!.snapshot.documentId));
  if (documentIds.size !== 1) {
    return { kind: 'unbound', reason: 'multiple-documents' };
  }

  const firstCapture = captures[0].photoshopPlacement!;
  return placementIntentFromCapturePlacement(firstCapture);
}

export function useConversation(
  services: AppServices,
  sessionBinding: ImagenSessionBinding,
  defaultOutput?: AppGenerationSettings,
  messages: ConversationMessages | AppMessages['conversation'] = DEFAULT_CONVERSATION_MESSAGES,
): ConversationController {
  const [rounds, setRounds] = useState<readonly ConversationRound[]>([]);
  const running = useMemo(() => rounds.some((round) => round.status === 'running'), [rounds]);
  const thumbnailStore = thumbnailStoreFrom(services);
  const previewCacheKeysRef = useRef<Map<string, readonly string[]>>(new Map());
  const previewAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const roundsRef = useRef<readonly ConversationRound[]>(rounds);
  const jobsRef = useRef<readonly JobSessionSnapshot[]>(sessionBinding.snapshot.jobs);
  const previewSignature = useMemo(
    () => previewWorkSignature(rounds, sessionBinding.snapshot.jobs),
    [rounds, sessionBinding.snapshot.jobs],
  );

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
  const submitAbortRef = useRef<AbortController | null>(null);

  const abortPreviewWork = useCallback(() => {
    for (const controller of previewAbortControllersRef.current.values()) {
      controller.abort();
    }
    previewAbortControllersRef.current.clear();
  }, []);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);

  useEffect(() => {
    jobsRef.current = sessionBinding.snapshot.jobs;
  }, [sessionBinding.snapshot.jobs]);

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

  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort();
      submitAbortRef.current = null;
      abortPreviewWork();
      releaseAttachments(roundsRef.current.flatMap((round) => round.attachments));
      for (const keys of previewCacheKeysRef.current.values()) {
        keys.forEach((key) => thumbnailStore.release(key));
      }
      previewCacheKeysRef.current.clear();
    };
  }, [abortPreviewWork, thumbnailStore]);

  useEffect(() => {
    const jobs = jobsRef.current;
    for (const round of roundsRef.current) {
      if (
        round.status !== 'ok' ||
        !round.jobId ||
        round.previews.length === 0 ||
        round.previews.every((preview) => preview.url) ||
        previewCacheKeysRef.current.has(round.id) ||
        previewAbortControllersRef.current.has(round.id)
      ) {
        continue;
      }
      const job = jobs.find((item) => item.id === round.jobId);
      const assets = job ? outputAssets(job.output) : round.previews.map((preview) => preview.asset);
      if (assets.length === 0) {
        continue;
      }

      const abortController = new AbortController();
      previewAbortControllersRef.current.set(round.id, abortController);
      void Promise.all(
        assets.map((asset, index) =>
          thumbnailStore.getOrCreate({
            asset,
            label: asset.name ?? `Asset ${index + 1}`,
            sourceKey: `${round.id}:${previewAssetSourceKey(asset, index)}`,
            signal: abortController.signal,
          }),
        ),
      ).then((entries) => {
        previewAbortControllersRef.current.delete(round.id);
        if (abortController.signal.aborted) {
          entries.forEach((entry) => entry.release());
          return;
        }
        const previous = previewCacheKeysRef.current.get(round.id) ?? [];
        previous.forEach((key) => thumbnailStore.release(key));
        previewCacheKeysRef.current.set(round.id, entries.map((entry) => entry.cacheKey));
        setRounds((current) =>
          current.map((item) => (item.id === round.id ? { ...item, previews: entries.map((entry) => entry.preview) } : item)),
        );
      }).catch((error) => {
        previewAbortControllersRef.current.delete(round.id);
        if (abortController.signal.aborted) {
          return;
        }
        setRounds((current) =>
          current.map((item) =>
            item.id === round.id ? errorRound(item, error instanceof Error ? error : new Error(String(error))) : item,
          ),
        );
      });
    }
  }, [previewSignature, thumbnailStore]);

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
      const abortController = new AbortController();
      submitAbortRef.current?.abort();
      submitAbortRef.current = abortController;

      try {
        const roundId = createRoundId();
        const attachments = input.attachments ?? [];
        const placementIntent = derivePlacementIntent(attachments);
        const createdAt = new Date().toISOString();
        const output = input.output ?? {
          count: 1,
          sizePreset: defaultOutput?.outputSizePreset ?? '2k',
          outputFormat: defaultOutput?.outputFormat ?? 'png',
          aspectRatio: defaultOutput?.aspectRatio ?? 'auto',
        };
        const providerInputSizePreset = input.providerInputSizePreset ?? defaultOutput?.providerInputSizePreset;
        const round: ConversationRound = {
          id: roundId,
          time: nowTime(),
          createdAt,
          prompt,
          status: 'running',
          providerName: input.providerName,
          ...(input.apiFormat ? { apiFormat: input.apiFormat } : {}),
          ...(input.providerId ? { providerId: input.providerId } : {}),
          profileId: input.profileId,
          ...(input.modelId ? { modelId: input.modelId } : {}),
          elapsedSeconds: 0,
          previews: [],
          attachments,
          output,
          ...(providerInputSizePreset !== undefined ? { providerInputSizePreset } : {}),
          placementIntent,
        };
        setRounds((current) => [...current, round]);

        try {
          await services.commands.putTaskRecord(createRunningTaskRecord({
            taskId: roundId,
            operation: input.operation,
            prompt,
            attachments,
            placementIntent,
            providerName: input.providerName,
            profileId: input.profileId,
            ...(input.modelId ? { modelId: input.modelId } : {}),
            createdAt,
          }));
          if (input.operation === 'image-edit' && attachments.length === 0) {
            throw new Error('Image edit requires an attachment. Capture from Photoshop or add an image.');
          }
          const providerOptions = input.modelId ? { model: input.modelId } : undefined;
          const workflow = input.operation === 'image-edit' ? 'provider-edit' : 'provider-generate';
          const providerInputAssets =
            input.operation === 'image-edit'
              ? attachments.map((attachment) => assetForJobInput(attachment.image))
              : undefined;
          const jobInput = {
            __clientRoundId: roundId,
            __clientTaskId: roundId,
            profileId: input.profileId,
            prompt,
            output,
            ...(providerOptions ? { providerOptions } : {}),
            ...(providerInputAssets ? { images: providerInputAssets } : {}),
          };
          const result = await sessionBinding.session.submitJob({
            workflow,
            input: jobInput,
            signal: abortController.signal,
          });

          setRounds((current) =>
            current.map((item) => {
              if (item.id !== roundId) {
                return item;
              }
              const next = result.ok
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
              return next;
            }),
          );
          if (result.ok && result.value.status === 'completed') {
            void services.retention?.requestSweep('generation-success');
          }
        } catch (error) {
          setRounds((current) =>
            current.map((item) =>
              item.id === roundId ? errorRound(item, error instanceof Error ? error : new Error(String(error))) : item,
            ),
          );
        }
      } finally {
        if (submitAbortRef.current === abortController) {
          submitAbortRef.current = null;
        }
        submitInFlightRef.current = false;
      }
    },
    [defaultOutput, messages, services.commands, sessionBinding.session, sessionBinding.snapshot.jobs],
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
        if (round?.status === 'err') {
          return;
        }
        if (round?.status === 'ok' && round.profileId) {
          await submit({
            operation: round.attachments.length > 0 ? 'image-edit' : 'text-to-image',
            prompt: round.prompt,
            profileId: round.profileId,
            ...(round.apiFormat ? { apiFormat: round.apiFormat } : {}),
            ...(round.providerId ? { providerId: round.providerId } : {}),
            providerName: round.providerName,
            ...(round.modelId ? { modelId: round.modelId } : {}),
            attachments: round.attachments,
            ...(round.output ? { output: round.output } : {}),
            ...(round.providerInputSizePreset ? { providerInputSizePreset: round.providerInputSizePreset } : {}),
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

  const clear = useCallback(() => {
    submitAbortRef.current?.abort();
    submitAbortRef.current = null;
    abortPreviewWork();
    releaseAttachments(rounds.flatMap((round) => round.attachments));
    roundsRef.current = [];
    for (const keys of previewCacheKeysRef.current.values()) {
      keys.forEach((key) => thumbnailStore.release(key));
    }
    previewCacheKeysRef.current.clear();
    setRounds([]);
  }, [abortPreviewWork, rounds, thumbnailStore]);

  return {
    rounds,
    running,
    submit,
    retry,
    clear,
  };
}

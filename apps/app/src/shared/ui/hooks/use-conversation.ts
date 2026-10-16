import type { ImageOutputSelection } from '@imagen-ps/application';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ProviderId,
  ComfyUiExecutionMaskInput,
  ComfyUiGenerationPayload,
  ComfyUiMaskBinding,
  JobError,
  JobSessionSnapshot,
  TaskRecord,
} from '@imagen-ps/application';
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
import {
  createImagePreviewFallback,
  type ImagePreviewFallback,
} from '../../image/preview-fallback';
import type { ImagenSessionBinding } from './use-imagen-session';
import type { AppMessages } from '../i18n/messages';
import type { HostImageAsset } from '../../domain/host-image-asset';
import type { CanonicalMaskAsset } from '../../domain/mask-source';
import type { EditRegion } from '../../domain/edit-region';
import {
  placementIntentFromCapturePlacement,
  type PlacementIntent,
  type PhotoshopCapturePlacement,
} from '../../domain/photoshop-placement';
import type { Asset } from '@imagen-ps/application';
import {
  createRunningTaskRecord,
} from '../../domain/task-snapshot';
import type { AppProviderInputSizePreset } from '../../ports/app-generation-settings';
import type { ComfyUiExecutionAssetInput } from '@imagen-ps/application';
import type { ComfyUiWorkflowValueMutation, WorkflowInputRef, WorkflowMapping, WorkflowPrimitiveValue } from '@imagen-ps/application';
import { comfyUiExecutionErrorFromJob, type ComfyUiExecutionErrorDetail } from '../comfyui-execution-error';

export interface ConversationAttachment {
  readonly id: string;
  readonly type: 'layer' | 'file' | 'photoshop-capture';
  readonly name: string;
  readonly image: HostImageAsset;
  readonly mask?: CanonicalMaskAsset;
  readonly previewUrl: string;
  readonly previewFallback?: ImagePreviewFallback;
  readonly previewGeneration?: number;
  readonly previewDispose?: () => void;
  readonly photoshopPlacement?: PhotoshopCapturePlacement;
}

export type RoundStatus = 'queued' | 'running' | 'ok' | 'err';

export interface ConversationRound {
  readonly id: string;
  readonly time: string;
  readonly createdAt?: string;
  readonly prompt: string;
  readonly status: RoundStatus;
  readonly providerName: string;
  readonly backendId?: 'provider' | 'comfyui';
  readonly workflowId?: string;
  readonly providerId?: ProviderId | 'mock';
  readonly elapsedSeconds: number;
  readonly elapsedLabel?: string;
  readonly errorMessage?: string;
  readonly comfyUiExecutionError?: ComfyUiExecutionErrorDetail;
  readonly jobId?: string;
  readonly queuePosition?: number;
  readonly queueState?: 'queued' | 'starting';
  readonly removable?: boolean;

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

interface SubmitConversationInputBase {
  readonly operation: 'image-edit' | 'text-to-image';
  readonly prompt: string;
  readonly providerName: string;
  readonly attachments?: readonly ConversationAttachment[];
  readonly editRegion?: EditRegion;
  readonly onPrepared?: () => void;
}

export interface SubmitProviderConversationInput extends SubmitConversationInputBase {
  readonly backendId?: 'provider';
  readonly providerId: 'grsai' | 'runninghub';
  readonly modelId?: string;
  readonly output?: AppGenerationSettingsOutput;
  readonly providerInputSizePreset?: AppProviderInputSizePreset;
  /** 当前固定 provider/model 的 catalog 参数集合。 */
  readonly parameters?: Readonly<Record<string, string>>;
}

export interface SubmitComfyUiConversationInput extends SubmitConversationInputBase {
  readonly backendId: 'comfyui';
  readonly selectedWorkflowId: string;
  readonly workflowName: string;
  readonly revision?: string;
  readonly formValues?: Readonly<Record<string, WorkflowPrimitiveValue>>;
  readonly mappings?: Readonly<{ readonly text: WorkflowMapping; readonly image: WorkflowMapping }>;
  readonly mutations?: readonly ComfyUiWorkflowValueMutation[];
  readonly imageInputRef?: WorkflowInputRef;
  readonly executionAttachments?: readonly ConversationAttachment[];
  readonly maskBinding?: ComfyUiMaskBinding;
}

export type SubmitConversationInput = SubmitProviderConversationInput | SubmitComfyUiConversationInput;

export interface AppGenerationSettingsOutput {
  readonly count: 1;
  readonly selection: ImageOutputSelection;
}

export interface ConversationController {
  readonly rounds: readonly ConversationRound[];
  readonly running: boolean;
  readonly submit: (input: SubmitConversationInput) => Promise<boolean>;
  readonly retry: (roundId: string) => Promise<void>;
  readonly removeQueuedTask: (roundId: string) => boolean;
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

function pendingPreview(asset: Asset, index: number): AssetPreview {
  const preview = assetToPreview(asset, index);
  if (preview.url || !asset.storedRef || asset.url || asset.data !== undefined) {
    return preview;
  }
  return {
    ...preview,
    fallback: createImagePreviewFallback('loading'),
  };
}

function pendingPreviews(assets: readonly Asset[]): readonly AssetPreview[] {
  return assets.map(pendingPreview);
}

function taskOutputAssets(task: TaskRecord): readonly Asset[] {
  return [...task.outputs]
    .sort((left, right) => left.index - right.index)
    .map((output) => ({
      type: 'image' as const,
      ...(output.asset.ref.name === undefined ? {} : { name: output.asset.ref.name }),
      ...(output.asset.ref.mimeType === undefined ? {} : { mimeType: output.asset.ref.mimeType }),
      storedRef: output.asset.ref,
    }));
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
    const jobAssets = job ? outputAssets(job.output) : [];
    const assets = jobAssets.length > 0 ? jobAssets : round.previews.map((preview) => preview.asset);
    if (assets.length === 0) {
      continue;
    }
    parts.push(`${round.id}:${round.jobId}:${assets.map(previewAssetSourceKey).join(',')}`);
  }
  return parts.join('|');
}

function releaseAttachments(attachments: readonly ConversationAttachment[]): void {
  const released = new Set<HostImageAsset>();
  for (const attachment of attachments) {
    attachment.previewDispose?.();
    for (const image of [attachment.image, attachment.mask].filter((value): value is HostImageAsset => value !== undefined)) {
      if (released.has(image)) {
        continue;
      }
      released.add(image);
      image.preview.dispose?.();
    }
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
    const comfyUiExecutionError = comfyUiExecutionErrorFromJob(job.error);
    return {
      ...current,
      status: 'err',
      jobId: job.id,
      errorMessage: errorMessage(job.error, messages.jobFailed),
      ...(comfyUiExecutionError === undefined ? {} : { comfyUiExecutionError }),
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
      assets.length === 0
        ? current.previews
        : current.status === 'ok' && current.previews.length === assets.length && current.previews.every((preview) => preview.url)
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
    `app.output=${output?.selection.geometry.kind ?? 'default'} providerInputSize=${round.providerInputSizePreset ?? 'default'}`,
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

function comfyUiAssetForExecution(image: HostImageAsset): ComfyUiExecutionAssetInput {
  const derivative = image.resource.derivatives.providerInput;
  if (
    derivative?.kind !== 'ready'
    || derivative.storedRef === undefined
    || derivative.width === undefined
    || derivative.height === undefined
  ) {
    throw new Error(`ComfyUI input derivative is not ready for image "${image.metadata.name ?? image.asset.name ?? image.resource.id}".`);
  }
  return {
    storedRef: derivative.storedRef,
    width: derivative.width,
    height: derivative.height,
  };
}

/** 将 frozen EditRegion 投影为 ComfyUI separate-image-input payload。 */
function comfyUiMaskForExecution(
  editRegion: EditRegion,
  binding: ComfyUiMaskBinding,
): ComfyUiExecutionMaskInput {
  const storedRef = editRegion.mask.asset.asset.storedRef;
  if (storedRef === undefined) throw new Error('ComfyUI Mask asset is not stored.');
  return {
    asset: {
      storedRef,
      width: editRegion.geometry.targetSize.width,
      height: editRegion.geometry.targetSize.height,
    },
    binding,
  };
}

function normalizedInputContextForAttachments(attachments: readonly ConversationAttachment[]): {
  readonly primaryEditInput?: { readonly width: number; readonly height: number };
} | undefined {
  const primary = attachments[0]?.image.resource.derivatives.providerInput;
  if (primary?.kind !== 'ready' || primary.width === undefined || primary.height === undefined) {
    return undefined;
  }
  return {
    primaryEditInput: {
      width: primary.width,
      height: primary.height,
    },
  };
}

export function derivePlacementIntent(
  attachments: readonly ConversationAttachment[],
  outputSelection?: ImageOutputSelection,
): PlacementIntent {
  const captures = attachments.filter((attachment) => attachment.photoshopPlacement !== undefined);
  if (captures.length === 0) {
    return { kind: 'unbound', reason: 'no-photoshop-capture' };
  }

  const documentIds = new Set(captures.map((attachment) => attachment.photoshopPlacement!.snapshot.documentId));
  if (documentIds.size !== 1) {
    return { kind: 'unbound', reason: 'multiple-documents' };
  }

  const firstCapture = captures[0].photoshopPlacement!;
  const placement = placementIntentFromCapturePlacement(firstCapture);
  return placement.kind === 'exact-frame' && outputSelection
    ? { ...placement, outputSelection }
    : placement;
}

export function useConversation(
  services: AppServices,
  sessionBinding: ImagenSessionBinding,
  defaultOutput?: { readonly providerInputSizePreset?: AppProviderInputSizePreset },
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
  const completedJobsRef = useRef<Set<string>>(new Set());

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
    const queuedByTaskId = new Map(sessionBinding.snapshot.queuedTasks.map((task, index) => [task.taskId, { task, index }]));
    const jobsByTaskId = new Map(
      sessionBinding.snapshot.jobs
        .filter((job) => job.taskId !== undefined)
        .map((job) => [job.taskId!, job]),
    );
    setRounds((current) =>
      current.map((round) => {
        const queued = queuedByTaskId.get(round.id);
        if (queued !== undefined) {
          return {
            ...round,
            status: 'queued',
            queueState: queued.task.status,
            queuePosition: queued.index + 1,
            removable: queued.task.removable,
            ...(queued.task.jobId !== undefined ? { jobId: queued.task.jobId } : {}),
          };
        }
        const sessionJob = jobsByTaskId.get(round.id)
          ?? sessionBinding.snapshot.jobs.find((job) => job.id === round.jobId);
        return sessionJob ? roundFromSessionJob(sessionJob, round, messages) : round;
      }),
    );
    for (const job of sessionBinding.snapshot.jobs) {
      if (job.status !== 'completed' || completedJobsRef.current.has(job.id)) continue;
      completedJobsRef.current.add(job.id);
      if (job.taskId !== undefined) {
        void services.commands.getTaskRecord(job.taskId).then((task) => {
          if (task === undefined) return;
          const assets = taskOutputAssets(task);
          if (assets.length === 0) return;
          setRounds((current) => current.map((round) => (
            round.id === task.taskId && round.previews.length === 0
              ? { ...round, previews: pendingPreviews(assets) }
              : round
          )));
        }).catch(() => undefined);
      }
      void services.retention?.requestSweep('generation-success');
    }
  }, [messages, services.commands, services.retention, sessionBinding.snapshot.jobs, sessionBinding.snapshot.queuedTasks]);

  useEffect(() => {
    return () => {
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
      const jobAssets = job ? outputAssets(job.output) : [];
      const assets = jobAssets.length > 0 ? jobAssets : round.previews.map((preview) => preview.asset);
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
      if (!prompt && input.backendId !== 'comfyui') {
        return false;
      }

      // 同 tick 门禁：封住 React 状态更新前的 send/regenerate 双击窗口。
      if (submitInFlightRef.current) {
        return false;
      }
      submitInFlightRef.current = true;
      void Promise.resolve().then(() => {
        submitInFlightRef.current = false;
      });
      let accepted = false;
      try {
        const roundId = createRoundId();
        const attachments = input.attachments ?? [];
        const providerInput = input.backendId === 'comfyui' ? undefined : input;
        const output = providerInput?.output;
        const placementIntent = derivePlacementIntent(attachments, output?.selection);
        const createdAt = new Date().toISOString();
        const providerInputSizePreset = providerInput
          ? providerInput.providerInputSizePreset ?? defaultOutput?.providerInputSizePreset
          : undefined;
        const round: ConversationRound = {
          id: roundId,
          time: nowTime(),
          createdAt,
          prompt,
          status: 'queued',
          queueState: 'queued',
          queuePosition: sessionBinding.snapshot.queuedTasks.length + 1,
          removable: true,
          providerName: input.providerName,
          backendId: input.backendId ?? 'provider',
          ...(providerInput?.providerId ? { providerId: providerInput.providerId } : {}),
          ...(providerInput?.providerId ? { providerId: providerInput.providerId } : {}),
          ...(providerInput ? { providerId: providerInput.providerId } : {}),
          ...(providerInput?.modelId ? { modelId: providerInput.modelId } : {}),
          ...(input.backendId === 'comfyui' ? {
            workflowId: input.selectedWorkflowId,
            modelId: input.workflowName,
          } : {}),
          elapsedSeconds: 0,
          previews: [],
          attachments,
          output,
          ...(providerInputSizePreset !== undefined ? { providerInputSizePreset } : {}),
          placementIntent,
        };
        setRounds((current) => [...current, round]);

        try {
          if (input.backendId !== 'comfyui' && input.operation === 'image-edit' && attachments.length === 0) {
            throw new Error('Image edit requires an attachment. Capture from Photoshop or add an image.');
          }
          if (input.backendId === 'comfyui') {
            const taskRecord = createRunningTaskRecord({
              taskId: roundId,
              operation: input.operation,
              prompt,
              attachments,
              ...(input.editRegion ? { editRegion: input.editRegion } : {}),
              placementIntent,
              execution: {
                backend: { id: 'comfyui', label: 'ComfyUI' },
                target: { id: input.selectedWorkflowId, label: input.workflowName },
              },
              createdAt,
            });
            input.onPrepared?.();
            const result = await sessionBinding.session.submitJob({
              taskId: roundId,
              backendId: 'comfyui',
              payload: {
                workflowId: input.selectedWorkflowId,
                ...(input.mutations ? {} : { prompt }),
                images: (input.executionAttachments ?? attachments).map((attachment) => comfyUiAssetForExecution(attachment.image)),
                ...(input.revision ? { revision: input.revision } : {}),
                ...(input.formValues ? { formValues: input.formValues } : {}),
                ...(input.mutations ? { mutations: input.mutations } : {}),
                ...(input.imageInputRef ? { imageInputRef: input.imageInputRef } : {}),
                ...(input.editRegion && input.maskBinding
                  ? { mask: comfyUiMaskForExecution(input.editRegion, input.maskBinding) }
                  : {}),
                runningTask: taskRecord,
              } satisfies ComfyUiGenerationPayload,
            });
            if (!result.ok) {
              setRounds((current) => current.map((item) => (
                item.id === roundId ? errorRound(item, result.error) : item
              )));
            } else {
              accepted = true;
            }
            return accepted;
          }
          if (providerInput === undefined) {
            throw new Error('Provider submission input is missing.');
          }
          const taskRecord = createRunningTaskRecord({
            taskId: roundId,
            operation: input.operation,
            prompt,
            attachments,
            ...(input.editRegion ? { editRegion: input.editRegion } : {}),
            placementIntent,
            execution: {
              backend: { id: 'provider', label: 'Provider' },
              connection: { id: providerInput.providerId, label: input.providerName },
              ...(providerInput.modelId ? { target: { id: providerInput.modelId, label: providerInput.modelId } } : {}),
            },
            createdAt,
          });
          const providerOptions = providerInput.modelId ? { model: providerInput.modelId } : undefined;
          const providerInputAssets =
            input.operation === 'image-edit'
              ? attachments.map((attachment) => assetForJobInput(attachment.image))
              : undefined;
          const inputContext = input.operation === 'image-edit'
            ? normalizedInputContextForAttachments(attachments)
            : undefined;
          const primaryAttachmentId = attachments[0]?.id;
          const maskImage = input.editRegion && primaryAttachmentId === input.editRegion.targetAttachmentId
            ? {
                asset: assetForJobInput(input.editRegion.mask.asset),
                targetAttachmentId: input.editRegion.targetAttachmentId,
                dimensions: {
                  width: input.editRegion.geometry.targetSize.width,
                  height: input.editRegion.geometry.targetSize.height,
                },
                encoding: input.editRegion.mask.encoding,
                bitDepth: input.editRegion.mask.bitDepth,
                polarity: input.editRegion.mask.polarity,
              }
            : undefined;
          const request = {
            prompt,
            ...(providerInput.providerId ? { providerId: providerInput.providerId } : {}),
            ...(providerInput.modelId ? { modelId: providerInput.modelId } : {}),
            ...(providerInput.parameters ? { parameters: providerInput.parameters } : {}),
            ...(output ? { output } : {}),
            ...(inputContext ? { inputContext } : {}),
            ...(providerOptions ? { providerOptions } : {}),
            ...(providerInputAssets ? { images: providerInputAssets } : {}),
            ...(primaryAttachmentId ? { primaryAttachmentId } : {}),
            ...(maskImage ? { maskImage } : {}),
          };
          input.onPrepared?.();
          const result = await sessionBinding.session.submitJob({
            taskId: roundId,
            backendId: 'provider',
            payload: {
              providerId: providerInput.providerId,
              operation: input.operation === 'image-edit' ? 'image_edit' : 'text_to_image',
              request,
              runningTask: taskRecord,
            },
          });
          if (!result.ok) {
            setRounds((current) => current.map((item) => (
              item.id === roundId ? errorRound(item, result.error) : item
            )));
          } else {
            accepted = true;
          }
        } catch (error) {
          setRounds((current) =>
            current.map((item) =>
              item.id === roundId ? errorRound(item, error instanceof Error ? error : new Error(String(error))) : item,
            ),
          );
        }
        return accepted;
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [defaultOutput, services.retention, sessionBinding.session, sessionBinding.snapshot.queuedTasks.length],
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
        if (round?.status === 'ok' && round.backendId === 'comfyui' && round.workflowId) {
          const state = await services.comfyUi.loadState();
          const identity = (await services.comfyUi.discover()).find((item) => item.workflowId === round.workflowId);
          if (state?.baseUrl === undefined || identity === undefined) {
            return;
          }
          await services.comfyUi.selectWorkflow(identity.workflowId);
          await submit({
            backendId: 'comfyui',
            operation: round.attachments.length > 0 ? 'image-edit' : 'text-to-image',
            prompt: round.prompt,
            providerName: 'ComfyUI',
            selectedWorkflowId: identity.workflowId,
            workflowName: identity.displayName,
            attachments: round.attachments,
          });
          return;
        }
        if (round?.status === 'ok' && round.providerId) {
          if (round.providerId !== 'runninghub' && round.providerId !== 'grsai') return;
          await submit({
            operation: round.attachments.length > 0 ? 'image-edit' : 'text-to-image',
            prompt: round.prompt,
            providerId: round.providerId,
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
                      round.attachments.length > 0 ? 'provider-edit' : 'provider-generate',
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
    [messages, rounds, services.comfyUi, sessionBinding.session, sessionBinding.snapshot.jobs, submit],
  );

  const clear = useCallback(() => {
    for (const round of rounds) {
      if (round.status === 'queued') sessionBinding.session.removeQueuedTask(round.id);
    }
    abortPreviewWork();
    releaseAttachments(rounds.flatMap((round) => round.attachments));
    roundsRef.current = [];
    for (const keys of previewCacheKeysRef.current.values()) {
      keys.forEach((key) => thumbnailStore.release(key));
    }
    previewCacheKeysRef.current.clear();
    setRounds([]);
  }, [abortPreviewWork, rounds, sessionBinding.session, thumbnailStore]);

  const removeQueuedTask = useCallback((roundId: string): boolean => {
    if (!sessionBinding.session.removeQueuedTask(roundId)) return false;
    const removed = roundsRef.current.find((round) => round.id === roundId);
    if (removed !== undefined) releaseAttachments(removed.attachments);
    setRounds((current) => current.filter((round) => round.id !== roundId));
    return true;
  }, [sessionBinding.session]);

  return {
    rounds,
    running,
    submit,
    retry,
    removeQueuedTask,
    clear,
  };
}

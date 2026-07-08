import type { ResolvedTaskResource, TaskOutput, TaskRecord } from '@imagen-ps/application';
import type { ConversationRound, RoundStatus } from '../hooks/use-conversation';
import {
  createImagePreviewFallback,
  fallbackStateFromAvailability,
  type ImagePreviewFallback,
} from '../../image/preview-fallback';

export const HISTORY_PAGE_LIMIT = 50;
const HISTORY_PROMPT_PREVIEW_LIMIT = 400;
const HISTORY_LABEL_LIMIT = 80;
const LONG_TOKEN_LIMIT = 96;
const DATA_URL_PATTERN = /data:image\/[^;]+;base64,[^\s]+/gi;
const URL_PATTERN = /https?:\/\/\S+/gi;
const WHITESPACE_PATTERN = /\s+/g;

export type HistoryFilter = 'all' | RoundStatus;
export type HistoryActionState = 'enabled' | 'disabled';

export interface HistoryItemActions {
  readonly retry: HistoryActionState;
  readonly download: HistoryActionState;
  readonly place: HistoryActionState;
}

export interface HistoryItemViewModel {
  readonly id: string;
  readonly taskId: string;
  readonly promptPreview: string;
  readonly providerLabel: string;
  readonly status: RoundStatus;
  readonly displayTime: string;
  readonly displayTimestamp: string;
  readonly isActive: boolean;
  readonly canLocate: boolean;
  readonly retryRoundId?: string;
  readonly previewUrl?: string;
  readonly previewFallback?: ImagePreviewFallback;
  readonly output?: TaskOutput;
  readonly taskRecord?: TaskRecord;
  readonly resourceState?: ResolvedTaskResource['availability'];
  readonly actions: HistoryItemActions;
}

export interface DeriveHistoryItemsInput {
  readonly durableRecords: readonly TaskRecord[];
  readonly activeRounds: readonly ConversationRound[];
  readonly previews: Readonly<Record<string, PreviewSnapshot | undefined>>;
  readonly canDownload: boolean;
  readonly canPlace: boolean;
  readonly noPrompt: string;
  readonly unknownProvider: string;
}

export interface PreviewSnapshot {
  readonly url?: string;
  readonly availability?: ResolvedTaskResource['availability'];
  readonly fallback?: ImagePreviewFallback;
}

function statusFromRecord(record: TaskRecord): RoundStatus {
  if (record.status === 'completed') {
    return 'ok';
  }
  if (record.status === 'failed' || record.status === 'interrupted') {
    return 'err';
  }
  return 'running';
}

function providerFromRecord(record: TaskRecord, fallback: string): string {
  return record.execution?.profileName ?? record.execution?.providerName ?? record.execution?.profileId ?? record.execution?.providerId ?? fallback;
}

function timeFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function sanitizeLongToken(token: string): string {
  if (token.length <= LONG_TOKEN_LIMIT) {
    return token;
  }
  return `${token.slice(0, 48)}…${token.slice(-16)}`;
}

export function toHistoryTextPreview(value: string, fallback: string, limit = HISTORY_PROMPT_PREVIEW_LIMIT): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  const normalized = trimmed
    .replace(DATA_URL_PATTERN, '[Image data]')
    .replace(URL_PATTERN, (url) => truncate(url, LONG_TOKEN_LIMIT))
    .replace(WHITESPACE_PATTERN, ' ')
    .split(' ')
    .map(sanitizeLongToken)
    .join(' ');
  return truncate(normalized, limit);
}

function toLabelPreview(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  return truncate(trimmed.replace(WHITESPACE_PATTERN, ' '), HISTORY_LABEL_LIMIT);
}

function actionStateForOutput(
  output: TaskOutput | undefined,
  record: TaskRecord | undefined,
  resourceState: ResolvedTaskResource['availability'] | undefined,
  canUseHostAction: boolean,
): HistoryActionState {
  if (!output || !record || !canUseHostAction) {
    return 'disabled';
  }
  if (resourceState === 'missing' || resourceState === 'unresolvable' || resourceState === 'remote-only') {
    return 'disabled';
  }
  return 'enabled';
}

function previewStateForOutput(
  record: TaskRecord,
  previews: Readonly<Record<string, PreviewSnapshot | undefined>>,
): {
  readonly output?: TaskOutput;
  readonly previewUrl?: string;
  readonly previewFallback?: ImagePreviewFallback;
  readonly resourceState?: ResolvedTaskResource['availability'];
} {
  const output = record.outputs[0];
  if (!output) {
    return {};
  }
  if (output.asset.ref.kind === 'url') {
    return {
      output,
      previewUrl: output.asset.ref.ref,
      resourceState: 'remote-only',
    };
  }
  const preview = previews[record.taskId];
  const fallbackState = preview?.fallback?.state ?? fallbackStateFromAvailability(preview?.availability);
  return {
    output,
    ...(preview?.url ? { previewUrl: preview.url } : {}),
    ...(!preview?.url && fallbackState ? {
      previewFallback: preview?.fallback ?? createImagePreviewFallback(fallbackState),
    } : {}),
    ...(preview?.availability ? { resourceState: preview.availability } : {}),
  };
}

function durableTimestamp(record: TaskRecord): string {
  return record.createdAt;
}

export function deriveHistoryItems(input: DeriveHistoryItemsInput): readonly HistoryItemViewModel[] {
  const byTaskId = new Map<string, HistoryItemViewModel>();

  for (const record of input.durableRecords) {
    const previewState = previewStateForOutput(record, input.previews);
    const providerLabel = toLabelPreview(providerFromRecord(record, input.unknownProvider), input.unknownProvider);
    const item: HistoryItemViewModel = {
      id: record.taskId,
      taskId: record.taskId,
      promptPreview: toHistoryTextPreview(record.prompt, input.noPrompt),
      providerLabel,
      status: statusFromRecord(record),
      displayTimestamp: durableTimestamp(record),
      displayTime: timeFromIso(durableTimestamp(record)),
      isActive: false,
      canLocate: false,
      ...(previewState.previewUrl ? { previewUrl: previewState.previewUrl } : {}),
      ...(previewState.previewFallback ? { previewFallback: previewState.previewFallback } : {}),
      ...(previewState.output ? { output: previewState.output } : {}),
      ...(previewState.resourceState ? { resourceState: previewState.resourceState } : {}),
      taskRecord: record,
      actions: {
        retry: 'disabled',
        download: actionStateForOutput(previewState.output, record, previewState.resourceState, input.canDownload),
        place: actionStateForOutput(previewState.output, record, previewState.resourceState, input.canPlace),
      },
    };
    byTaskId.set(record.taskId, item);
  }

  for (const round of input.activeRounds) {
    if (round.status !== 'running' && round.status !== 'err') {
      continue;
    }
    const existing = byTaskId.get(round.id);
    const output = existing?.output;
    const resourceState = existing?.resourceState;
    byTaskId.set(round.id, {
      id: round.id,
      taskId: round.id,
      promptPreview: toHistoryTextPreview(existing?.taskRecord?.prompt ?? round.prompt, input.noPrompt),
      providerLabel: toLabelPreview(existing?.providerLabel ?? round.providerName, input.unknownProvider),
      status: round.status,
      displayTimestamp: round.createdAt ?? existing?.displayTimestamp ?? '',
      displayTime: round.time,
      isActive: true,
      canLocate: true,
      ...(round.status === 'err' ? { retryRoundId: round.id } : {}),
      ...(round.previews[0]?.url ? { previewUrl: round.previews[0].url } : existing?.previewUrl ? { previewUrl: existing.previewUrl } : {}),
      ...(!round.previews[0]?.url && round.previews[0]?.fallback
        ? { previewFallback: round.previews[0].fallback }
        : existing?.previewFallback
          ? { previewFallback: existing.previewFallback }
          : {}),
      ...(output ? { output } : {}),
      ...(resourceState ? { resourceState } : {}),
      ...(existing?.taskRecord ? { taskRecord: existing.taskRecord } : {}),
      actions: {
        retry: round.status === 'err' ? 'enabled' : 'disabled',
        download: actionStateForOutput(output, existing?.taskRecord, resourceState, input.canDownload),
        place: actionStateForOutput(output, existing?.taskRecord, resourceState, input.canPlace),
      },
    });
  }

  const items = Array.from(byTaskId.values());
  items.sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }
    return right.displayTimestamp.localeCompare(left.displayTimestamp);
  });
  return items.slice(0, HISTORY_PAGE_LIMIT);
}

export function filterHistoryItems(items: readonly HistoryItemViewModel[], selectedFilter: HistoryFilter): readonly HistoryItemViewModel[] {
  return selectedFilter === 'all' ? items : items.filter((item) => item.status === selectedFilter);
}

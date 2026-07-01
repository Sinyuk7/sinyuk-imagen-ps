import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ResolvedTaskResource, TaskOutput, TaskRecord } from '@imagen-ps/application';
import type { TaskResourceResolverPort } from '../../ports/app-services';
import type { ConversationRound, RoundStatus } from '../hooks/use-conversation';
import { Icon } from '../components/icons';
import { ActionButton } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { useNotice } from '../components/notice';
import { ToastHost } from '../components/toast-host';
import { useI18n } from '../i18n/i18n-context';

const STATUS_COLOR: Record<RoundStatus, string> = { ok: 'var(--app-color-positive)', running: 'var(--app-color-notice)', err: 'var(--app-color-negative)' };

interface HistoryPageProps {
  readonly onNav: (view: string) => void;
  readonly rounds: readonly ConversationRound[];
  readonly records: readonly TaskRecord[];
  readonly loading: boolean;
  readonly error?: string;
  readonly onReload: () => Promise<void>;
  readonly onRetry: (roundId: string) => Promise<void>;
  readonly taskResources?: TaskResourceResolverPort;
  readonly onPlaceTaskOutput?: (record: TaskRecord, outputId: string) => Promise<void>;
  readonly onLocateRound?: (roundId: string) => void;
  readonly onMiss?: () => void;
}

type HistoryFilter = 'all' | RoundStatus;

interface HistoryItem {
  readonly id: string;
  readonly prompt: string;
  readonly status: RoundStatus;
  readonly providerName: string;
  readonly time: string;
  readonly previewUrl?: string;
  readonly retryRoundId?: string;
  readonly output?: TaskOutput;
  readonly taskRecord?: TaskRecord;
  readonly resourceState?: ResolvedTaskResource['availability'];
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

function itemFromRecord(
  record: TaskRecord,
  noPrompt: string,
  unknownProvider: string,
  previewUrl: string | undefined,
  resourceState: ResolvedTaskResource['availability'] | undefined,
): HistoryItem {
  const output = record.outputs[0];
  return {
    id: record.taskId,
    prompt: record.prompt.length > 0 ? record.prompt : noPrompt,
    status: statusFromRecord(record),
    providerName: providerFromRecord(record, unknownProvider),
    time: timeFromIso(record.updatedAt),
    ...(previewUrl ? { previewUrl } : {}),
    ...(output ? { output } : {}),
    taskRecord: record,
    ...(resourceState ? { resourceState } : {}),
  };
}

function outputItemId(record: TaskRecord, output: TaskOutput): string {
  return record.outputs.length <= 1 ? record.taskId : `${record.taskId}:${output.outputId}`;
}

function itemFromRound(round: ConversationRound): HistoryItem {
  return {
    id: round.id,
    prompt: round.prompt,
    status: round.status,
    providerName: round.providerName,
    time: round.time,
    ...(round.previews[0]?.url ? { previewUrl: round.previews[0].url } : {}),
    ...(round.status === 'err' ? { retryRoundId: round.id } : {}),
  };
}

interface PreviewState {
  readonly url: string;
  readonly availability: ResolvedTaskResource['availability'];
}

function downloadBytes(bytes: ArrayBuffer, name: string, mimeType: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Download is unavailable in this runtime.');
  }
  const blob = new Blob([bytes.slice(0)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function HistoryPage({ onNav, rounds, records, loading, error, onReload, onRetry, taskResources, onPlaceTaskOutput, onLocateRound, onMiss }: HistoryPageProps) {
  const { messages: t } = useI18n();
  const { notice: toast, show, clear, pause, resume } = useNotice({ defaultDurationMs: null });
  const [filter, setFilter] = useState<'all' | RoundStatus>('all');
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const filters: readonly [HistoryFilter, string][] = [
    ['all', t.status.all],
    ['ok', t.status.done],
    ['running', t.status.running],
    ['err', t.status.failed],
  ];
  const statusLabel: Record<RoundStatus, string> = { ok: t.status.done, running: t.status.running, err: t.status.failed };

  useEffect(() => {
    let disposed = false;
    const disposers: Array<() => void> = [];
    void Promise.all(records.flatMap((record) => record.outputs.map(async (output) => {
      if (!taskResources && output.asset.ref.kind !== 'url') {
        return undefined;
      }
      const resolved: ResolvedTaskResource = taskResources
        ? await taskResources.resolve(output.asset)
        : { resource: output.asset, availability: 'remote-only' as const, preview: { url: output.asset.ref.ref } };
      if (resolved.preview?.dispose) {
        disposers.push(resolved.preview.dispose);
      }
      return [outputItemId(record, output), { url: resolved.preview?.url ?? '', availability: resolved.availability }] as const;
    }))).then((entries) => {
      if (disposed) {
        disposers.forEach((dispose) => dispose());
        return;
      }
      setPreviews(Object.fromEntries(entries.filter((entry): entry is readonly [string, PreviewState] => entry !== undefined)));
    });

    return () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
    };
  }, [records, taskResources]);

  const onDownload = useCallback(async (item: HistoryItem) => {
    if (!item.output || !taskResources) {
      show(t.history.resourceUnavailable, 'info', { durationMs: 4000 });
      return;
    }
    try {
      const resolved = await taskResources.resolve(item.output.asset);
      if (resolved.availability !== 'available' || !resolved.bytes) {
        resolved.preview?.dispose?.();
        show(t.history.resourceUnavailable, 'info', { durationMs: 4000 });
        return;
      }
      downloadBytes(
        resolved.bytes,
        item.output.asset.ref.name ?? `${item.output.outputId}.png`,
        item.output.asset.ref.mimeType ?? 'image/png',
      );
      resolved.preview?.dispose?.();
    } catch (downloadError) {
      show(downloadError instanceof Error ? downloadError.message : String(downloadError), 'negative', { durationMs: 7000, dismissible: true });
    }
  }, [show, t.history.resourceUnavailable, taskResources]);

  const onPlace = useCallback(async (item: HistoryItem) => {
    if (!item.output || !item.taskRecord || !onPlaceTaskOutput) {
      show(t.history.resourceUnavailable, 'info', { durationMs: 4000 });
      return;
    }
    try {
      await onPlaceTaskOutput(item.taskRecord, item.output.outputId);
    } catch (placeError) {
      show(placeError instanceof Error ? placeError.message : String(placeError), 'negative', { durationMs: 7000, dismissible: true });
    }
  }, [onPlaceTaskOutput, show, t.history.resourceUnavailable]);

  const items = useMemo(() => {
    const durable = records.flatMap((record) => {
      const firstItem = itemFromRecord(
        record,
        t.history.noPrompt,
        t.history.unknownProvider,
        previews[record.taskId]?.url,
        previews[record.taskId]?.availability,
      );
      if (record.outputs.length <= 1) {
        return [firstItem];
      }
      return record.outputs.map((output) => ({
        ...firstItem,
        id: outputItemId(record, output),
        previewUrl: previews[outputItemId(record, output)]?.url,
        resourceState: previews[outputItemId(record, output)]?.availability,
        output,
      }));
    });
    const active = rounds.filter((round) => round.status === 'running' || round.status === 'err').map(itemFromRound);
    return [...active, ...durable];
  }, [previews, records, rounds, t.history.noPrompt, t.history.unknownProvider]);
  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.status === filter)),
    [filter, items],
  );

  return (
    <div className="page page-enter">
      <header className="hdr">
        <IconButton
          data-testid="history-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => onNav('main')}
        />
        <div className="hdr-title">{t.history.title}</div>
        <IconButton
          data-testid="history-refresh-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="refresh" />}
          tooltip={t.common.refresh}
          onClick={() => { void onReload(); }}
        />
      </header>
      <div className="filter-bar">
        {filters.map(([key, label]) => (
          <ActionButton
            key={key}
            data-testid={`history-filter-${key}`}
            className="fchip"
            quiet
            selected={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </ActionButton>
        ))}
      </div>
      <div className="scroll">
        {loading && <div style={{ padding: '16px', color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.history.loading}</div>}
        {error && <div style={{ padding: '16px', color: 'var(--app-color-negative)', fontSize: 12 }}>{error}</div>}
        {!loading && filtered.length === 0
          ? <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.history.empty}</div>
          : filtered.map((item) => {
            const retryRoundId = item.retryRoundId;
            return (
            <div key={item.id} data-testid={`history-row-${item.id}`} className="task-row" onClick={() => {
              const isCurrent = rounds.some((round) => round.id === item.id);
              if (isCurrent) {
                onLocateRound?.(item.id);
              } else {
                show(t.toast.historyNotInCurrentSession, 'info', { durationMs: 4000 });
                onMiss?.();
              }
            }}>
              <div className="task-thumb">
                {item.previewUrl
                  ? <img src={item.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="" />
                  : item.status === 'running'
                    ? <Icon name="spinner" size={14} className="spin" />
                    : item.status === 'err'
                      ? <Icon name="error" size={14} />
                      : <div style={{ width: '100%', height: '100%', background: 'var(--app-color-background-layer-2)', borderRadius: 'inherit' }} />
                }
              </div>
              <div className="task-info">
                <div className="task-prompt">{item.prompt}</div>
                <div className="task-meta">
                  <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 10, color: 'var(--app-color-text-muted)' }}>{item.providerName}</span>
                  <span className="task-meta-dot">·</span>
                  <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 10, color: 'var(--app-color-text-muted)' }}>{item.time}</span>
                </div>
                <div className="status-inline" style={{ marginTop: 1 }}>
                  <span className={`sdot ${item.status === 'running' ? 'run' : item.status}`} />
                  <span style={{ color: STATUS_COLOR[item.status], fontSize: 10 }}>{statusLabel[item.status]}</span>
                  {retryRoundId && (
                    <button
                      data-testid={`history-retry-button-${retryRoundId}`}
                      className="row-retry"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onRetry(retryRoundId);
                      }}
                    >
                      {t.history.retry}
                    </button>
                  )}
                  {item.output && (
                    <>
                    <IconButton
                      data-testid={`history-download-button-${item.id}`}
                      className="row-icon-action"
                      quiet
                      icon={<Icon name="download" size={12} />}
                      tooltip={t.history.download}
                      iconSize={12}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDownload(item);
                      }}
                    />
                    <IconButton
                      data-testid={`history-place-button-${item.id}`}
                      className="row-icon-action"
                      quiet
                      icon={<Icon name="place-ps" size={12} />}
                      tooltip={t.history.place}
                      iconSize={12}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onPlace(item);
                      }}
                    />
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })
        }
      </div>
      <ToastHost toast={toast} onClose={clear} onPause={pause} onResume={resume} />
    </div>
  );
}

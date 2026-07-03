import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedTaskResource, TaskOutput, TaskRecord } from '@imagen-ps/application';
import type { TaskResourceResolverPort } from '../../ports/app-services';
import type { ConversationRound, RoundStatus } from '../hooks/use-conversation';
import { Icon } from '../components/icons';
import { ActionButton } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { useToast } from '../components/toast-host';
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
  readonly onDownloadTaskOutput?: (record: TaskRecord, outputId: string) => Promise<void>;
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
  readonly status: 'idle' | 'queued' | 'loading' | 'ready' | 'error';
  readonly availability?: ResolvedTaskResource['availability'];
  readonly url?: string;
  readonly dispose?: () => void;
}

const PREVIEW_QUEUE_CONCURRENCY = 2;
const PREVIEW_ROOT_MARGIN = '250px 0px';

export function HistoryPage({ onNav, rounds, records, loading, error, onReload, onRetry, taskResources, onDownloadTaskOutput, onPlaceTaskOutput, onLocateRound, onMiss }: HistoryPageProps) {
  const { messages: t } = useI18n();
  const { show } = useToast();
  const [filter, setFilter] = useState<'all' | RoundStatus>('all');
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previewTargetsRef = useRef(new Map<string, HTMLElement>());
  const queueRef = useRef<string[]>([]);
  const queuedRef = useRef(new Set<string>());
  const loadingRef = useRef(new Set<string>());
  const aliveIdsRef = useRef(new Set<string>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const previewsRef = useRef<Record<string, PreviewState>>({});
  const filters: readonly [HistoryFilter, string][] = [
    ['all', t.status.all],
    ['ok', t.status.done],
    ['running', t.status.running],
    ['err', t.status.failed],
  ];
  const statusLabel: Record<RoundStatus, string> = { ok: t.status.done, running: t.status.running, err: t.status.failed };

  const releasePreview = useCallback((state: PreviewState | undefined) => {
    state?.dispose?.();
  }, []);

  const outputPreviewCandidates = useMemo(() => records.flatMap((record) => {
    if (record.status !== 'completed') {
      return [];
    }
    return record.outputs
      .filter((output) => output.asset.ref.kind !== 'url')
      .map((output) => ({
      id: outputItemId(record, output),
      resource: output.asset,
      }));
  }), [records]);

  const outputPreviewMap = useMemo(
    () => new Map(outputPreviewCandidates.map((item) => [item.id, item.resource])),
    [outputPreviewCandidates],
  );

  useEffect(() => {
    aliveIdsRef.current = new Set(outputPreviewCandidates.map((item) => item.id));
    queueRef.current = queueRef.current.filter((id) => aliveIdsRef.current.has(id));
    queuedRef.current = new Set([...queuedRef.current].filter((id) => aliveIdsRef.current.has(id)));
    loadingRef.current = new Set([...loadingRef.current].filter((id) => aliveIdsRef.current.has(id)));
    setPreviews((current) => {
      const next: Record<string, PreviewState> = {};
      for (const [id, state] of Object.entries(current)) {
        if (aliveIdsRef.current.has(id)) {
          next[id] = state;
        } else {
          releasePreview(state);
        }
      }
      return next;
    });
  }, [outputPreviewCandidates, releasePreview]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  const drainPreviewQueue = useCallback(() => {
    if (!taskResources) {
      return;
    }
    while (loadingRef.current.size < PREVIEW_QUEUE_CONCURRENCY) {
      const nextId = queueRef.current.shift();
      if (!nextId) {
        return;
      }
      queuedRef.current.delete(nextId);
      if (loadingRef.current.has(nextId) || !aliveIdsRef.current.has(nextId)) {
        continue;
      }
      const resource = outputPreviewMap.get(nextId);
      if (!resource) {
        continue;
      }
      loadingRef.current.add(nextId);
      setPreviews((current) => ({
        ...current,
        [nextId]: { status: 'loading' },
      }));
      void taskResources.resolve(resource)
        .then((resolved) => {
          if (!aliveIdsRef.current.has(nextId)) {
            resolved.preview?.dispose?.();
            return;
          }
          setPreviews((current) => {
            releasePreview(current[nextId]);
            if (resolved.preview?.url) {
              return {
                ...current,
                [nextId]: {
                  status: 'ready',
                  availability: resolved.availability,
                  url: resolved.preview.url,
                  dispose: resolved.preview.dispose,
                },
              };
            }
            return {
              ...current,
              [nextId]: {
                status: 'error',
                availability: resolved.availability,
              },
            };
          });
        })
        .catch(() => {
          if (!aliveIdsRef.current.has(nextId)) {
            return;
          }
          setPreviews((current) => ({
            ...current,
            [nextId]: { status: 'error' },
          }));
        })
        .finally(() => {
          loadingRef.current.delete(nextId);
          drainPreviewQueue();
        });
    }
  }, [outputPreviewMap, releasePreview, taskResources]);

  const enqueuePreview = useCallback((id: string, priority: 'background' | 'foreground' = 'background') => {
    if (!taskResources || !aliveIdsRef.current.has(id)) {
      return;
    }
    const current = previewsRef.current[id];
    if (current?.status === 'ready' || current?.status === 'loading' || current?.status === 'queued') {
      return;
    }
    if (queuedRef.current.has(id) || loadingRef.current.has(id)) {
      return;
    }
    queuedRef.current.add(id);
    if (priority === 'foreground') {
      queueRef.current.unshift(id);
    } else {
      queueRef.current.push(id);
    }
    setPreviews((states) => ({
      ...states,
      [id]: { status: 'queued' },
    }));
    drainPreviewQueue();
  }, [drainPreviewQueue, taskResources]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      for (const state of Object.values(previewsRef.current)) {
        releasePreview(state);
      }
      previewTargetsRef.current.clear();
      queueRef.current = [];
      queuedRef.current.clear();
      loadingRef.current.clear();
      aliveIdsRef.current.clear();
    };
  }, [releasePreview]);

  useEffect(() => {
    if (!taskResources) {
      return undefined;
    }
    if (typeof IntersectionObserver !== 'function') {
      outputPreviewCandidates.forEach((item) => {
        if (item.resource.ref.kind !== 'url') {
          enqueuePreview(item.id);
        }
      });
      return undefined;
    }
    const root = scrollRef.current;
    if (!root) {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const id = (entry.target as HTMLElement).dataset.previewId;
        if (id) {
          enqueuePreview(id);
        }
      }
    }, {
      root,
      rootMargin: PREVIEW_ROOT_MARGIN,
      threshold: 0.01,
    });
    observerRef.current = observer;
    for (const element of previewTargetsRef.current.values()) {
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [enqueuePreview, outputPreviewCandidates, taskResources]);

  const bindPreviewTarget = useCallback((id: string | undefined) => (element: HTMLDivElement | null) => {
    const current = previewTargetsRef.current.get(id ?? '');
    if (current && observerRef.current) {
      observerRef.current.unobserve(current);
    }
    if (!id) {
      return;
    }
    if (element) {
      previewTargetsRef.current.set(id, element);
      if (observerRef.current) {
        observerRef.current.observe(element);
      } else if (!taskResources) {
        enqueuePreview(id);
      }
    } else {
      previewTargetsRef.current.delete(id);
    }
  }, [enqueuePreview, taskResources]);

  const onDownload = useCallback(async (item: HistoryItem) => {
    if (!item.output || !item.taskRecord || !onDownloadTaskOutput) {
      show(t.history.resourceUnavailable, 'info', { key: 'history-output-unavailable' });
      return;
    }
    try {
      await onDownloadTaskOutput(item.taskRecord, item.output.outputId);
    } catch (downloadError) {
      show(downloadError instanceof Error ? downloadError.message : String(downloadError), 'negative', { key: 'history-download-error' });
    }
  }, [onDownloadTaskOutput, show, t.history.resourceUnavailable]);

  const onPlace = useCallback(async (item: HistoryItem) => {
    if (!item.output || !item.taskRecord || !onPlaceTaskOutput) {
      show(t.history.resourceUnavailable, 'info', { key: 'history-output-unavailable' });
      return;
    }
    try {
      await onPlaceTaskOutput(item.taskRecord, item.output.outputId);
    } catch (placeError) {
      show(placeError instanceof Error ? placeError.message : String(placeError), 'negative', { key: 'history-place-error' });
    }
  }, [onPlaceTaskOutput, show, t.history.resourceUnavailable]);

  const items = useMemo(() => {
    const durable = records.flatMap((record) => {
      const firstOutput = record.outputs[0];
      const firstPreview = firstOutput
        ? (firstOutput.asset.ref.kind === 'url'
          ? { url: firstOutput.asset.ref.ref, availability: 'remote-only' as const }
          : previews[outputItemId(record, firstOutput)])
        : undefined;
      const firstItem = itemFromRecord(record, t.history.noPrompt, t.history.unknownProvider, firstPreview?.url, firstPreview?.availability);
      if (record.outputs.length <= 1) {
        return [firstItem];
      }
      return record.outputs.map((output) => ({
        ...firstItem,
        id: outputItemId(record, output),
        previewUrl: output.asset.ref.kind === 'url' ? output.asset.ref.ref : previews[outputItemId(record, output)]?.url,
        resourceState: output.asset.ref.kind === 'url' ? 'remote-only' : previews[outputItemId(record, output)]?.availability,
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
      <div className="scroll" ref={scrollRef}>
        {loading && <div style={{ padding: '16px', color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.history.loading}</div>}
        {error && <div style={{ padding: '16px', color: 'var(--app-color-negative)', fontSize: 12 }}>{error}</div>}
        {!loading && filtered.length === 0
          ? <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.history.empty}</div>
          : filtered.map((item) => {
            const retryRoundId = item.retryRoundId;
            const previewState = previews[item.id];
            return (
            <div key={item.id} data-testid={`history-row-${item.id}`} className="task-row" onClick={() => {
              if (item.output && item.output.asset.ref.kind !== 'url') {
                enqueuePreview(item.id, 'foreground');
              }
              const isCurrent = rounds.some((round) => round.id === item.id);
              if (isCurrent) {
                onLocateRound?.(item.id);
              } else {
                show(t.toast.historyNotInCurrentSession, 'info', { key: 'history-session-miss' });
                onMiss?.();
              }
            }}>
              <div
                className="task-thumb"
                ref={bindPreviewTarget(item.output && item.output.asset.ref.kind !== 'url' ? item.id : undefined)}
                data-preview-id={item.output && item.output.asset.ref.kind !== 'url' ? item.id : undefined}
              >
                {item.previewUrl
                  ? <img src={item.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="" />
                  : item.status === 'running'
                    ? <Icon name="spinner" size={14} className="spin" />
                    : item.status === 'err'
                      ? <Icon name="error" size={14} />
                      : previewState?.status === 'loading' || previewState?.status === 'queued'
                        ? <Icon name="spinner" size={14} className="spin" />
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
    </div>
  );
}

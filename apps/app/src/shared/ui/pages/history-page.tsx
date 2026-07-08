import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedTaskResource, TaskRecord } from '@imagen-ps/application';
import type { TaskResourceResolverPort } from '../../ports/app-services';
import type { ConversationRound, RoundStatus } from '../hooks/use-conversation';
import {
  createImagePreviewFallback,
  fallbackStateFromAvailability,
  type ImagePreviewFallback,
} from '../../image/preview-fallback';
import { ImageFallbackContent, imageFallbackTitle } from '../components/image-fallback-content';
import { Icon } from '../components/icons';
import { ActionButton } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { useToast } from '../components/toast-host';
import { useI18n } from '../i18n/i18n-context';
import {
  deriveHistoryItems,
  filterHistoryItems,
  type HistoryFilter,
  type HistoryItemViewModel,
  type PreviewSnapshot,
} from './history-view-model';

const STATUS_COLOR: Record<RoundStatus, string> = { ok: 'var(--app-color-positive)', running: 'var(--app-color-notice)', err: 'var(--app-color-negative)' };
const PREVIEW_QUEUE_CONCURRENCY = 2;
const PREVIEW_ROOT_MARGIN = '250px 0px';
const MAX_RESOLVED_PREVIEWS = 12;
const NO_PREVIEW_LOAD = Symbol('no-preview-load');

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

interface PreviewState {
  readonly status: 'queued' | 'loading' | 'ready' | 'error';
  readonly availability?: ResolvedTaskResource['availability'];
  readonly url?: string;
  readonly fallback?: ImagePreviewFallback;
  readonly dispose?: () => void;
  readonly resolvedAt?: number;
}

function previewSnapshotFromState(state: PreviewState | undefined): PreviewSnapshot | undefined {
  if (!state) {
    return undefined;
  }
  return {
    ...(state.url ? { url: state.url } : {}),
    ...(state.availability ? { availability: state.availability } : {}),
    ...(state.fallback ? { fallback: state.fallback } : {}),
  };
}

export function HistoryPage({
  onNav,
  rounds,
  records,
  loading,
  error,
  onReload,
  onRetry,
  taskResources,
  onDownloadTaskOutput,
  onPlaceTaskOutput,
  onLocateRound,
  onMiss,
}: HistoryPageProps) {
  const { messages: t } = useI18n();
  const { show } = useToast();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previewTargetsRef = useRef(new Map<string, HTMLElement>());
  const queueRef = useRef<string[]>([]);
  const queuedRef = useRef(new Set<string>());
  const loadingRef = useRef(new Set<string>());
  const visibleRef = useRef(new Set<string>());
  const aliveIdsRef = useRef(new Set<string>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const previewsRef = useRef<Record<string, PreviewState>>({});
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const filters: readonly [HistoryFilter, string][] = [
    ['all', t.status.all],
    ['ok', t.status.done],
    ['running', t.status.running],
    ['err', t.status.failed],
  ];
  const statusLabel: Record<RoundStatus, string> = { ok: t.status.done, running: t.status.running, err: t.status.failed };

  const canDownload = onDownloadTaskOutput !== undefined;
  const canPlace = onPlaceTaskOutput !== undefined;
  const previewResources = useMemo(() => records
    .filter((record) => record.status === 'completed')
    .flatMap((record) => {
      const output = record.outputs[0];
      if (!output || output.asset.ref.kind === 'url') {
        return [];
      }
      return [{ id: record.taskId, resource: output.asset }];
    }), [records]);
  const previewResourceMap = useMemo(
    () => new Map(previewResources.map((item) => [item.id, item.resource])),
    [previewResources],
  );

  const releasePreview = useCallback((state: PreviewState | undefined) => {
    state?.dispose?.();
  }, []);

  const evictResolvedPreviews = useCallback((current: Record<string, PreviewState>): Record<string, PreviewState> => {
    const resolved = Object.entries(current)
      .filter(([, state]) => state.status === 'ready' && state.resolvedAt !== undefined);
    if (resolved.length <= MAX_RESOLVED_PREVIEWS) {
      return current;
    }
    const next = { ...current };
    const evictable = resolved
      .filter(([id]) => !visibleRef.current.has(id))
      .sort((left, right) => (left[1].resolvedAt ?? 0) - (right[1].resolvedAt ?? 0));
    for (const [id] of evictable) {
      if (Object.values(next).filter((state) => state.status === 'ready').length <= MAX_RESOLVED_PREVIEWS) {
        break;
      }
      releasePreview(next[id]);
      delete next[id];
    }
    return next;
  }, [releasePreview]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    aliveIdsRef.current = new Set(previewResources.map((item) => item.id));
    visibleRef.current = new Set([...visibleRef.current].filter((id) => aliveIdsRef.current.has(id)));
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
  }, [previewResources, releasePreview]);

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
      const resource = previewResourceMap.get(nextId);
      if (!resource) {
        continue;
      }
      const generation = generationRef.current;
      loadingRef.current.add(nextId);
      setPreviews((current) => ({
        ...current,
        [nextId]: { status: 'loading' },
      }));
      void taskResources.resolve(resource)
        .then((resolved) => {
          const stale = !mountedRef.current || generation !== generationRef.current || !aliveIdsRef.current.has(nextId);
          if (stale) {
            resolved.preview?.dispose?.();
            return;
          }
          setPreviews((current) => {
            releasePreview(current[nextId]);
            const fallbackState = resolved.preview?.url ? undefined : fallbackStateFromAvailability(resolved.availability);
            const nextState: PreviewState = resolved.preview?.url
              ? {
                  status: 'ready',
                  availability: resolved.availability,
                  url: resolved.preview.url,
                  dispose: resolved.preview.dispose,
                  resolvedAt: Date.now(),
                }
              : {
                  status: 'ready',
                  availability: resolved.availability,
                  fallback: createImagePreviewFallback(fallbackState ?? 'preview-unavailable'),
                  resolvedAt: Date.now(),
                };
            return evictResolvedPreviews({
              ...current,
              [nextId]: nextState,
            });
          });
        })
        .catch(() => {
          if (!mountedRef.current || generation !== generationRef.current || !aliveIdsRef.current.has(nextId)) {
            return;
          }
          setPreviews((current) => ({
            ...current,
            [nextId]: {
              status: 'error',
              fallback: createImagePreviewFallback('preview-unavailable', 'unknown'),
            },
          }));
        })
        .finally(() => {
          loadingRef.current.delete(nextId);
          drainPreviewQueue();
        });
    }
  }, [evictResolvedPreviews, previewResourceMap, releasePreview, taskResources]);

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
      generationRef.current += 1;
      observerRef.current?.disconnect();
      observerRef.current = null;
      for (const state of Object.values(previewsRef.current)) {
        releasePreview(state);
      }
      previewTargetsRef.current.clear();
      queueRef.current = [];
      queuedRef.current.clear();
      loadingRef.current.clear();
      visibleRef.current.clear();
      aliveIdsRef.current.clear();
    };
  }, [releasePreview]);

  useEffect(() => {
    if (!taskResources) {
      return undefined;
    }
    if (typeof IntersectionObserver !== 'function') {
      return undefined;
    }
    const root = scrollRef.current;
    if (!root) {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.previewId;
        if (!id) {
          continue;
        }
        if (entry.isIntersecting) {
          visibleRef.current.add(id);
          enqueuePreview(id);
        } else {
          visibleRef.current.delete(id);
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
  }, [enqueuePreview, taskResources]);

  const bindPreviewTarget = useCallback((id: string | typeof NO_PREVIEW_LOAD) => (element: HTMLDivElement | null) => {
    const key = id === NO_PREVIEW_LOAD ? '' : id;
    const current = previewTargetsRef.current.get(key);
    if (current && observerRef.current) {
      observerRef.current.unobserve(current);
    }
    if (!key) {
      return;
    }
    if (element) {
      previewTargetsRef.current.set(key, element);
      if (observerRef.current) {
        observerRef.current.observe(element);
      }
    } else {
      previewTargetsRef.current.delete(key);
      visibleRef.current.delete(key);
    }
  }, []);

  const previewSnapshots = useMemo(
    () => Object.fromEntries(Object.entries(previews).map(([id, state]) => [id, previewSnapshotFromState(state)])),
    [previews],
  );

  const items = useMemo(() => deriveHistoryItems({
    durableRecords: records,
    activeRounds: rounds,
    previews: previewSnapshots,
    canDownload,
    canPlace,
    noPrompt: t.history.noPrompt,
    unknownProvider: t.history.unknownProvider,
  }), [canDownload, canPlace, previewSnapshots, records, rounds, t.history.noPrompt, t.history.unknownProvider]);

  const filtered = useMemo(
    () => filterHistoryItems(items, filter),
    [filter, items],
  );

  const onDownload = useCallback(async (item: HistoryItemViewModel) => {
    if (item.actions.download !== 'enabled' || !item.output || !item.taskRecord || !onDownloadTaskOutput) {
      show(t.history.resourceUnavailable, 'info', { key: 'history-output-unavailable' });
      return;
    }
    try {
      await onDownloadTaskOutput(item.taskRecord, item.output.outputId);
    } catch (downloadError) {
      show(downloadError instanceof Error ? downloadError.message : String(downloadError), 'negative', { key: 'history-download-error' });
    }
  }, [onDownloadTaskOutput, show, t.history.resourceUnavailable]);

  const onPlace = useCallback(async (item: HistoryItemViewModel) => {
    if (item.actions.place !== 'enabled' || !item.output || !item.taskRecord || !onPlaceTaskOutput) {
      show(t.history.resourceUnavailable, 'info', { key: 'history-output-unavailable' });
      return;
    }
    try {
      await onPlaceTaskOutput(item.taskRecord, item.output.outputId);
    } catch (placeError) {
      show(placeError instanceof Error ? placeError.message : String(placeError), 'negative', { key: 'history-place-error' });
    }
  }, [onPlaceTaskOutput, show, t.history.resourceUnavailable]);

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
            const fallback =
              item.previewFallback
              ?? (item.status === 'running' || previewState?.status === 'loading' || previewState?.status === 'queued'
                ? createImagePreviewFallback('loading')
                : item.output && item.output.asset.ref.kind !== 'url' && taskResources
                  ? createImagePreviewFallback('loading')
                  : previewState?.fallback
                    ?? (item.status === 'err'
                      ? createImagePreviewFallback('preview-unavailable')
                      : createImagePreviewFallback('empty')));
            const previewTargetId = item.output && item.output.asset.ref.kind !== 'url' && taskResources && typeof IntersectionObserver === 'function'
              ? item.id
              : NO_PREVIEW_LOAD;
            return (
              <div key={item.id} data-testid={`history-row-${item.id}`} className="task-row" onClick={() => {
                if (item.output && item.output.asset.ref.kind !== 'url') {
                  enqueuePreview(item.id, 'foreground');
                }
                if (item.canLocate) {
                  onLocateRound?.(item.taskId);
                } else {
                  show(t.toast.historyNotInCurrentSession, 'info', { key: 'history-session-miss' });
                  onMiss?.();
                }
              }}>
                <div
                  className="task-thumb"
                  ref={bindPreviewTarget(previewTargetId)}
                  data-preview-id={previewTargetId === NO_PREVIEW_LOAD ? undefined : previewTargetId}
                >
                  {item.previewUrl
                    ? <img src={item.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="" />
                    : (
                      <ImageFallbackContent
                        density="thumbnail"
                        state={fallback.state}
                        title={imageFallbackTitle(t.imageFallback, fallback.state)}
                      />
                    )
                  }
                </div>
                <div className="task-info">
                  <div className="task-prompt">{item.promptPreview}</div>
                  <div className="task-meta">
                    <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 10, color: 'var(--app-color-text-muted)' }}>{item.providerLabel}</span>
                    <span className="task-meta-dot">·</span>
                    <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 10, color: 'var(--app-color-text-muted)' }}>{item.displayTime}</span>
                  </div>
                  <div className="status-inline" style={{ marginTop: 1 }}>
                    <span className={`sdot ${item.status === 'running' ? 'run' : item.status}`} />
                    <span style={{ color: STATUS_COLOR[item.status], fontSize: 10 }}>{statusLabel[item.status]}</span>
                    {retryRoundId && item.actions.retry === 'enabled' && (
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
                          disabled={item.actions.download !== 'enabled'}
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
                          disabled={item.actions.place !== 'enabled'}
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

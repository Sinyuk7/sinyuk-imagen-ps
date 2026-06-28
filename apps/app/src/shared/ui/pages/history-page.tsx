import { useMemo, useState } from 'react';
import type { DurableJobRecord } from '@imagen-ps/application';
import type { ConversationRound, RoundStatus } from '../hooks/use-conversation';
import { Icon } from '../components/icons';
import { ActionButton } from '../primitives/spectrum-controls';
import { ToastHost, useToast } from '../components/toast-host';
import { useI18n } from '../i18n/i18n-context';

const STATUS_COLOR: Record<RoundStatus, string> = { ok: 'var(--app-color-positive)', running: 'var(--app-color-notice)', err: 'var(--app-color-negative)' };

interface HistoryPageProps {
  readonly onNav: (view: string) => void;
  readonly rounds: readonly ConversationRound[];
  readonly records: readonly DurableJobRecord[];
  readonly loading: boolean;
  readonly error?: string;
  readonly onReload: () => Promise<void>;
  readonly onRetry: (roundId: string) => Promise<void>;
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
}

function statusFromRecord(record: DurableJobRecord): RoundStatus {
  if (record.status === 'completed') {
    return 'ok';
  }
  if (record.status === 'failed') {
    return 'err';
  }
  return 'running';
}

function promptFromInput(input: Record<string, unknown>, fallback: string): string {
  return typeof input.prompt === 'string' && input.prompt.length > 0 ? input.prompt : fallback;
}

function providerFromInput(input: Record<string, unknown>, fallback: string): string {
  if (typeof input.profileId === 'string') {
    return input.profileId;
  }
  if (typeof input.providerProfileId === 'string') {
    return input.providerProfileId;
  }
  return typeof input.provider === 'string' ? input.provider : fallback;
}

function timeFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function itemFromRecord(record: DurableJobRecord, noPrompt: string, unknownProvider: string): HistoryItem {
  return {
    id: record.jobId,
    prompt: promptFromInput(record.input, noPrompt),
    status: statusFromRecord(record),
    providerName: providerFromInput(record.input, unknownProvider),
    time: timeFromIso(record.updatedAt),
  };
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

export function HistoryPage({ onNav, rounds, records, loading, error, onReload, onRetry, onLocateRound, onMiss }: HistoryPageProps) {
  const { messages: t } = useI18n();
  const { toast, show, close } = useToast();
  const [filter, setFilter] = useState<'all' | RoundStatus>('all');
  const filters: readonly [HistoryFilter, string][] = [
    ['all', t.status.all],
    ['ok', t.status.done],
    ['running', t.status.running],
    ['err', t.status.failed],
  ];
  const statusLabel: Record<RoundStatus, string> = { ok: t.status.done, running: t.status.running, err: t.status.failed };
  const items = useMemo(() => {
    const durable = records.map((record) => itemFromRecord(record, t.history.noPrompt, t.history.unknownProvider));
    const active = rounds.filter((round) => round.status === 'running' || round.status === 'err').map(itemFromRound);
    return [...active, ...durable];
  }, [records, rounds, t.history.noPrompt, t.history.unknownProvider]);
  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.status === filter)),
    [filter, items],
  );

  return (
    <div className="page page-enter">
      <header className="hdr">
        <ActionButton
          data-testid="history-back-button"
          className="hdr-btn"
          quiet
          onClick={() => onNav('main')}
        >
          <Icon name="chevron-left" slot="icon" />
        </ActionButton>
        <div className="hdr-title">{t.history.title}</div>
        <ActionButton
          data-testid="history-refresh-button"
          className="hdr-btn"
          quiet
          label={t.common.refresh}
          onClick={() => { void onReload(); }}
        >
          <Icon name="refresh" slot="icon" />
        </ActionButton>
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
                show(t.toast.historyNotInCurrentSession, 'info');
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
                </div>
              </div>
            </div>
            );
          })
        }
      </div>
      <ToastHost toast={toast} onClose={close} />
    </div>
  );
}

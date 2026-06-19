import { useMemo, useState } from 'react';
import type { DurableJobRecord } from '@imagen-ps/application';
import type { ConversationRound, RoundStatus } from '../hooks/use-conversation';
import { Icon } from '../components/icons';
import { useI18n } from '../i18n/i18n-context';

const STATUS_COLOR: Record<RoundStatus, string> = { ok: 'var(--ok)', running: 'var(--wa)', err: 'var(--er)' };

interface HistoryPageProps {
  readonly onNav: (view: string) => void;
  readonly rounds: readonly ConversationRound[];
  readonly records: readonly DurableJobRecord[];
  readonly loading: boolean;
  readonly error?: string;
  readonly onReload: () => Promise<void>;
  readonly onRetry: (roundId: string) => Promise<void>;
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

export function HistoryPage({ onNav, rounds, records, loading, error, onReload, onRetry }: HistoryPageProps) {
  const { messages: t } = useI18n();
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
        <button className="hdr-btn" onClick={() => onNav('main')}>
          <Icon name="chevron-left" />
        </button>
        <div className="hdr-title">{t.history.title}</div>
        <button className="hdr-btn" onClick={() => { void onReload(); }}>
          <Icon name="refresh" />
        </button>
      </header>
      <div className="filter-bar">
        {filters.map(([key, label]) => (
          <button key={key} className={`fchip${filter === key ? ' act' : ''}`} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      <div className="scroll">
        {loading && <div style={{ padding: '16px', color: 'var(--txd)', fontSize: 12 }}>{t.history.loading}</div>}
        {error && <div style={{ padding: '16px', color: 'var(--er)', fontSize: 12 }}>{error}</div>}
        {!loading && filtered.length === 0
          ? <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--txd)', fontSize: 12 }}>{t.history.empty}</div>
          : filtered.map((item) => {
            const retryRoundId = item.retryRoundId;
            return (
            <div key={item.id} className="task-row" onClick={() => onNav('main')}>
              <div className="task-thumb">
                {item.previewUrl
                  ? <img src={item.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="" />
                  : item.status === 'running'
                    ? <Icon name="spinner" size={14} className="spin" />
                    : item.status === 'err'
                      ? <Icon name="error" size={14} />
                      : <div style={{ width: '100%', height: '100%', background: 'var(--s2)', borderRadius: 'inherit' }} />
                }
              </div>
              <div className="task-info">
                <div className="task-prompt">{item.prompt}</div>
                <div className="task-meta">
                  <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>{item.providerName}</span>
                  <span style={{ color: 'var(--bd2)' }}>·</span>
                  <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>{item.time}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                  <span className={`sdot ${item.status === 'running' ? 'run' : item.status}`} />
                  <span style={{ color: STATUS_COLOR[item.status], fontSize: 10 }}>{statusLabel[item.status]}</span>
                  {retryRoundId && (
                    <button
                      style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--er)', background: 'none', border: 'none', cursor: 'pointer' }}
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
    </div>
  );
}

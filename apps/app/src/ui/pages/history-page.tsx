import { useMemo, useState } from 'react';
import type { DurableJobRecord } from '@imagen-ps/application';
import type { ConversationRound, RoundStatus } from '../hooks/use-conversation';
import { SI } from '../components/icons';

const STATUS_COLOR: Record<RoundStatus, string> = { ok: 'var(--ok)', running: 'var(--wa)', err: 'var(--er)' };
const STATUS_LABEL: Record<RoundStatus, string> = { ok: '完成', running: '运行中', err: '失败' };

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

function promptFromInput(input: Record<string, unknown>): string {
  return typeof input.prompt === 'string' && input.prompt.length > 0 ? input.prompt : '(no prompt)';
}

function providerFromInput(input: Record<string, unknown>): string {
  if (typeof input.profileId === 'string') {
    return input.profileId;
  }
  if (typeof input.providerProfileId === 'string') {
    return input.providerProfileId;
  }
  return typeof input.provider === 'string' ? input.provider : 'unknown';
}

function timeFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function itemFromRecord(record: DurableJobRecord): HistoryItem {
  return {
    id: record.jobId,
    prompt: promptFromInput(record.input),
    status: statusFromRecord(record),
    providerName: providerFromInput(record.input),
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
  const [filter, setFilter] = useState<'all' | RoundStatus>('all');
  const filters: readonly [HistoryFilter, string][] = [
    ['all', '全部'],
    ['ok', '完成'],
    ['running', '运行中'],
    ['err', '失败'],
  ];
  const items = useMemo(() => {
    const durable = records.map(itemFromRecord);
    const active = rounds.filter((round) => round.status === 'running' || round.status === 'err').map(itemFromRound);
    return [...active, ...durable];
  }, [records, rounds]);
  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.status === filter)),
    [filter, items],
  );

  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => onNav('main')}>
          <SI d="m15 18-6-6 6-6" />
        </button>
        <div className="hdr-title">历史</div>
        <button className="hdr-btn" onClick={() => { void onReload(); }}>
          <SI d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
        </button>
      </header>
      <div className="filter-bar">
        {filters.map(([key, label]) => (
          <button key={key} className={`fchip${filter === key ? ' act' : ''}`} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      <div className="scroll">
        {loading && <div style={{ padding: '16px', color: 'var(--txd)', fontSize: 12 }}>读取历史中...</div>}
        {error && <div style={{ padding: '16px', color: 'var(--er)', fontSize: 12 }}>{error}</div>}
        {!loading && filtered.length === 0
          ? <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--txd)', fontSize: 12 }}>暂无历史记录</div>
          : filtered.map((item) => {
            const retryRoundId = item.retryRoundId;
            return (
            <div key={item.id} className="task-row" onClick={() => onNav('main')}>
              <div className="task-thumb">
                {item.previewUrl
                  ? <img src={item.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="" />
                  : item.status === 'running'
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wa)" strokeWidth="1.5" className="spin"><path d="M21 12a9 9 0 1 1-9-9" /></svg>
                    : item.status === 'err'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--er)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>
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
                  <span style={{ color: STATUS_COLOR[item.status], fontSize: 10 }}>{STATUS_LABEL[item.status]}</span>
                  {retryRoundId && (
                    <button
                      style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--er)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onRetry(retryRoundId);
                      }}
                    >
                      重试
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

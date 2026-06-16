import { useMemo, useState } from 'react';
import type { ConversationRound, RoundStatus } from '../hooks/use-conversation';
import { SI } from '../components/icons';

const STATUS_COLOR: Record<RoundStatus, string> = { ok: 'var(--ok)', running: 'var(--wa)', err: 'var(--er)' };
const STATUS_LABEL: Record<RoundStatus, string> = { ok: '完成', running: '运行中', err: '失败' };

interface HistoryPageProps {
  readonly onNav: (view: string) => void;
  readonly rounds: readonly ConversationRound[];
  readonly onRetry: (roundId: string) => Promise<void>;
}

export function HistoryPage({ onNav, rounds, onRetry }: HistoryPageProps) {
  const [filter, setFilter] = useState<'all' | RoundStatus>('all');
  const filters: readonly ['all' | RoundStatus, string][] = [
    ['all', '全部'],
    ['ok', '完成'],
    ['running', '运行中'],
    ['err', '失败'],
  ];
  const filtered = useMemo(
    () => (filter === 'all' ? rounds : rounds.filter((round) => round.status === filter)),
    [filter, rounds],
  );

  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => onNav('main')}>
          <SI d="m15 18-6-6 6-6" />
        </button>
        <div className="hdr-title">历史</div>
        <div style={{ width: 32 }} />
      </header>
      <div className="filter-bar">
        {filters.map(([key, label]) => (
          <button key={key} className={`fchip${filter === key ? ' act' : ''}`} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      <div className="scroll">
        {filtered.length === 0
          ? <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--txd)', fontSize: 12 }}>当前会话暂无记录</div>
          : filtered.map((round) => (
            <div key={round.id} className="task-row" onClick={() => onNav('main')}>
              <div className="task-thumb">
                {round.previews[0]?.url
                  ? <img src={round.previews[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} alt="" />
                  : round.status === 'running'
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wa)" strokeWidth="1.5" className="spin"><path d="M21 12a9 9 0 1 1-9-9" /></svg>
                    : round.status === 'err'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--er)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>
                      : <div style={{ width: '100%', height: '100%', background: 'var(--s2)', borderRadius: 'inherit' }} />
                }
              </div>
              <div className="task-info">
                <div className="task-prompt">{round.prompt}</div>
                <div className="task-meta">
                  <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>{round.providerName}</span>
                  <span style={{ color: 'var(--bd2)' }}>·</span>
                  <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>{round.time}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                  <span className={`sdot ${round.status === 'running' ? 'run' : round.status}`} />
                  <span style={{ color: STATUS_COLOR[round.status], fontSize: 10 }}>{STATUS_LABEL[round.status]}</span>
                  {round.status === 'err' && (
                    <button
                      style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--er)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onRetry(round.id);
                      }}
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

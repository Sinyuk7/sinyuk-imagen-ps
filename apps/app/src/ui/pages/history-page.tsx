import { useState } from 'react';
import { SI } from '../components/icons';

const HIST_DATA = [
  { id: 1, st: 'run', prompt: '换成更冷的色调，偏蓝灰色，增加窗外雨景，保持同样的构图', prov: 'n1n.ai', time: '14:31', date: '今天', grad: null },
  { id: 2, st: 'ok',  prompt: '一只橘猫坐在咖啡馆窗边，窗外是下午的街景和阳光，数字油画风格，暖色调', prov: 'n1n.ai', time: '14:23', date: '今天', grad: 'linear-gradient(155deg,#1a2035 0%,#2c4060 40%,#1f3830 70%,#1a2a20 100%)' },
  { id: 3, st: 'err', prompt: 'a futuristic cityscape at dusk, neon reflections on wet streets, cinematic', prov: 'Replicate', time: '14:11', date: '今天', grad: null },
  { id: 4, st: 'ok',  prompt: '山间清晨，薄雾缭绕，水墨画风格，留白，极简构图', prov: 'OpenAI', time: '09:48', date: '今天', grad: 'linear-gradient(155deg,#1a2a1a 0%,#2a3a25 50%,#1a2520 100%)' },
  { id: 5, st: 'ok',  prompt: 'portrait of a cyberpunk hacker girl, glowing implants, dark alley background', prov: 'n1n.ai', time: '22:14', date: '昨天', grad: 'linear-gradient(155deg,#1a1a2e 0%,#2a1a3a 50%,#1a2030 100%)' },
  { id: 6, st: 'ok',  prompt: '复古海报风格，爵士乐演出，霓虹灯，1960年代纽约', prov: 'n1n.ai', time: '19:33', date: '昨天', grad: 'linear-gradient(155deg,#2a1a10 0%,#3a2a15 50%,#251a10 100%)' },
  { id: 7, st: 'err', prompt: 'abstract fluid art, vibrant colors, 8k resolution, trending on artstation', prov: 'Replicate', time: '15:02', date: '昨天', grad: null },
  { id: 8, st: 'ok',  prompt: '白色极简主义室内设计，落地窗，下午阳光，北欧风格', prov: 'OpenAI', time: '10:17', date: '昨天', grad: 'linear-gradient(155deg,#232323 0%,#303030 50%,#252525 100%)' },
];

const STATUS_COLOR: Record<string, string> = { ok: 'var(--ok)', run: 'var(--wa)', err: 'var(--er)' };
const STATUS_LABEL: Record<string, string> = { ok: '完成', run: '运行中', err: '失败' };

interface HistoryPageProps {
  onNav: (view: string) => void;
}

export function HistoryPage({ onNav }: HistoryPageProps) {
  const [filter, setFilter] = useState('all');
  const filters: [string, string][] = [['all', '全部'], ['ok', '完成'], ['run', '运行中'], ['err', '失败']];
  const filtered = filter === 'all' ? HIST_DATA : HIST_DATA.filter(t => t.st === filter);

  const groups: Record<string, typeof HIST_DATA> = {};
  for (const t of filtered) {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  }

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
        {filters.map(([k, l]) => (
          <button key={k} className={`fchip${filter === k ? ' act' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="scroll">
        {filtered.length === 0
          ? <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--txd)', fontSize: 12 }}>暂无记录</div>
          : Object.entries(groups).map(([date, tasks]) => (
            <div key={date}>
              <div className="date-lbl">{date}</div>
              {tasks.map(t => (
                <div key={t.id} className="task-row" onClick={() => onNav('main')}>
                  <div className="task-thumb">
                    {t.st === 'ok' && t.grad
                      ? <div style={{ width: '100%', height: '100%', background: t.grad, borderRadius: 'inherit' }} />
                      : t.st === 'run'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wa)" strokeWidth="1.5" className="spin"><path d="M21 12a9 9 0 1 1-9-9" /></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--er)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>
                    }
                  </div>
                  <div className="task-info">
                    <div className="task-prompt">{t.prompt}</div>
                    <div className="task-meta">
                      <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>{t.prov}</span>
                      <span style={{ color: 'var(--bd2)' }}>·</span>
                      <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>{t.time}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                      <span className={`sdot ${t.st}`} />
                      <span style={{ color: STATUS_COLOR[t.st], fontSize: 10 }}>{STATUS_LABEL[t.st]}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        }
      </div>
    </div>
  );
}

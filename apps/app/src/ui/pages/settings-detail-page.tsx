import { useState } from 'react';
import { SI } from '../components/icons';

interface SettingsDetailPageProps {
  onNav: (view: string) => void;
}

export function SettingsDetailPage({ onNav }: SettingsDetailPageProps) {
  const [showKey, setShowKey] = useState(false);
  const [selMod, setSelMod] = useState('sd3-medium');
  const [selAsp, setSelAsp] = useState('4:3');
  const [steps, setSteps] = useState(30);
  const [cfg, setCfg] = useState(7);
  const [cnt, setCnt] = useState(1);
  const [adv, setAdv] = useState(false);
  const [testSt, setTestSt] = useState<'idle' | 'testing' | 'ok'>('idle');
  const [fmt, setFmt] = useState('PNG');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  const asps = [
    { r: '1:1',  w: 20, h: 20 },
    { r: '4:3',  w: 24, h: 18 },
    { r: '16:9', w: 28, h: 16 },
    { r: '9:16', w: 16, h: 28 },
  ];

  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => onNav('settings')}>
          <SI d="m15 18-6-6 6-6" />
        </button>
        <div className="hdr-center">
          <span style={{ fontFamily: 'var(--fD)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>n1n.ai</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--ok)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
            已连接
          </div>
        </div>
        <button className="hdr-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </header>

      <div className="scroll">
        {/* API Key */}
        <div className="section">
          <div className="section-title">连接信息</div>
          <div className="field">
            <label className="field-label">API Key</label>
            <div className="pw-wrap">
              <input type={showKey ? 'text' : 'password'} className="field-input mono" defaultValue="sk-••••••••••••••••4f2a" />
              <button className="pw-toggle" onClick={() => setShowKey(s => !s)}>
                <SI d={showKey
                  ? "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                  : "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
                } />
              </button>
            </div>
          </div>
        </div>

        {/* Model */}
        <div className="section">
          <div className="section-title">默认模型</div>
          <div className="chips">
            {['sd3-medium', 'sdxl', 'sd3-large', 'ultra'].map(m => (
              <button key={m} className={`chip${m === selMod ? ' act' : ''}`} onClick={() => setSelMod(m)}>{m}</button>
            ))}
          </div>
        </div>

        {/* Generation params */}
        <div className="section">
          <div className="section-title">生成参数</div>
          <div className="field">
            <label className="field-label">宽高比</label>
            <div className="aspect-grid">
              {asps.map(a => (
                <button key={a.r} className={`aspect-opt${a.r === selAsp ? ' act' : ''}`} onClick={() => setSelAsp(a.r)}>
                  <div className="aspect-ico" style={{ width: a.w, height: a.h }} />
                  <span className="aspect-lbl">{a.r}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label">Steps</label>
            <div className="slider-wrap">
              <input type="range" className="slider" min="10" max="50" value={steps} onChange={e => setSteps(Number(e.target.value))} />
              <span className="slider-val">{steps}</span>
            </div>
          </div>
          <div className="field">
            <label className="field-label">CFG Scale</label>
            <div className="slider-wrap">
              <input type="range" className="slider" min="1" max="20" step="0.5" value={cfg} onChange={e => setCfg(Number(e.target.value))} />
              <span className="slider-val">{cfg.toFixed(1)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txm)', flex: 1 }}>输出数量</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 4].map(n => (
                <button key={n} className={`param-val${n === cnt ? ' act' : ''}`} onClick={() => setCnt(n)}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced */}
        <button className="adv-toggle" onClick={() => setAdv(o => !o)}>
          <SI d={["M12 2v2m0 16v2m10-10h-2M4 12H2", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"]} />
          高级参数
          <span className={`adv-chev${adv ? ' open' : ''}`}><SI sz={10} d="m6 9 6 6 6-6" /></span>
        </button>
        <div className="adv-body" style={{ maxHeight: adv ? 240 : 0 }}>
          <div className="section" style={{ borderTop: 'none' }}>
            <div className="field">
              <label className="field-label">Seed</label>
              <input type="number" className="field-input mono" placeholder="留空 = 随机" />
              <div className="field-hint">固定 seed 可复现结果</div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">输出格式</label>
              <div className="chips">
                {['PNG', 'JPEG', 'WebP'].map(f => (
                  <button key={f} className={`chip${f === fmt ? ' act' : ''}`} onClick={() => setFmt(f)}>{f}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Test connection */}
        <div className="test-area">
          <button
            className="test-btn"
            disabled={testSt === 'testing'}
            onClick={() => { setTestSt('testing'); setTimeout(() => setTestSt('ok'), 1600); }}
          >
            {testSt === 'testing'
              ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 1 1-9-9" /></svg> 测试中...</>
              : <><SI d="M5 12h14M12 5l7 7-7 7" /> 测试连接</>
            }
          </button>
          {testSt === 'ok' && (
            <div className="test-result ok">
              <SI d="M20 6 9 17l-5-5" w={2.5} /> 连接成功 · 余额 $12.40
            </div>
          )}
        </div>
      </div>

      <footer className="det-footer">
        <button className="btn-save" onClick={() => { showToast('已保存'); onNav('settings'); }}>保存</button>
        <button className="btn-del">
          <SI d={["M3 6h18", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"]} />
        </button>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

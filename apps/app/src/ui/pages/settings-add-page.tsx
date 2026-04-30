import { useState } from 'react';
import { SI } from '../components/icons';

interface FamOption {
  id: string;
  label: string;
  desc: string;
  ico: string;
  hasBase: boolean;
}

const FAM_OPTS: FamOption[] = [
  { id: 'openai',    label: 'OpenAI Compatible', desc: '支持 OpenAI API 格式', ico: 'OA', hasBase: true },
  { id: 'replicate', label: 'Replicate',          desc: 'Replicate 模型平台',   ico: 'RP', hasBase: false },
  { id: 'fal',       label: 'Fal.ai',             desc: '高速推理平台',         ico: 'FA', hasBase: false },
  { id: 'together',  label: 'Together AI',        desc: '开源模型云服务',       ico: 'TA', hasBase: false },
];

interface SettingsAddPageProps {
  onNav: (view: string) => void;
}

export function SettingsAddPage({ onNav }: SettingsAddPageProps) {
  const [step, setStep] = useState(1);
  const [fam, setFam] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testSt, setTestSt] = useState<'idle' | 'testing' | 'ok'>('idle');

  const sel = FAM_OPTS.find(f => f.id === fam);

  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => step === 1 ? onNav('settings') : setStep(1)}>
          <SI d="m15 18-6-6 6-6" />
        </button>
        <div className="hdr-center">
          <span style={{ fontFamily: 'var(--fD)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>
            {step === 1 ? '添加 Provider' : sel?.label}
          </span>
          {step === 2 && <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>2 / 2</span>}
        </div>
        <div style={{ width: 32 }} />
      </header>

      <div className="scroll">
        {step === 1 ? (
          <div>
            <div className="sec-lbl" style={{ paddingTop: 16 }}>选择类型</div>
            {FAM_OPTS.map(f => (
              <div key={f.id} className="prov-row" onClick={() => { setFam(f.id); setStep(2); }}>
                <div className="prov-ico" style={{ background: 'var(--s2)', color: 'var(--txm)', fontFamily: 'var(--fM)', fontSize: 10 }}>{f.ico}</div>
                <div className="prov-info">
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>{f.label}</div>
                  <div style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)', marginTop: 2 }}>{f.desc}</div>
                </div>
                <SI d="m9 18 6-6-6-6" style={{ color: 'var(--txd)' }} />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="section">
              <div className="section-title">Profile</div>
              <div className="field">
                <label className="field-label">显示名称</label>
                <input className="field-input" placeholder={sel?.label} value={name} onChange={e => setName(e.target.value)} />
              </div>
              {sel?.hasBase && (
                <div className="field">
                  <label className="field-label">Base URL</label>
                  <input className="field-input mono" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                  <div className="field-hint">兼容 OpenAI API 格式的服务地址</div>
                </div>
              )}
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">API Key</label>
                <div className="pw-wrap">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="field-input mono"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                  />
                  <button className="pw-toggle" onClick={() => setShowKey(s => !s)}>
                    <SI d={showKey
                      ? "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                      : "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
                    } />
                  </button>
                </div>
              </div>
            </div>
            <div className="test-area">
              <button
                className="test-btn"
                disabled={testSt === 'testing'}
                onClick={() => { setTestSt('testing'); setTimeout(() => setTestSt('ok'), 1600); }}
              >
                {testSt === 'testing'
                  ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 1 1-9-9" /></svg> 测试中...</>
                  : '测试连接'
                }
              </button>
              {testSt === 'ok' && (
                <div className="test-result ok">
                  <SI d="M20 6 9 17l-5-5" w={2.5} /> 连接成功
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {step === 2 && (
        <footer className="det-footer">
          <button className="btn-save" onClick={() => onNav('settings')}>保存</button>
          <button
            style={{ padding: '10px 14px', borderRadius: 'var(--rsm)', border: '1px solid var(--bd)', background: 'transparent', color: 'var(--txm)', fontFamily: 'var(--fB)', fontSize: 13, cursor: 'pointer' }}
            onClick={() => onNav('settings')}
          >
            取消
          </button>
        </footer>
      )}
    </div>
  );
}

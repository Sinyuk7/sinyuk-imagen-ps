import { SI } from '../components/icons';

interface ProviderEntry {
  ico: string;
  bg: string;
  col: string;
  name: string;
  family: string;
  badge: string;
  bl: string;
  model: string;
  dots: string[];
}

const PROVS: ProviderEntry[] = [
  { ico: 'N',  bg: 'rgba(120,231,192,.12)', col: 'var(--pr)', name: 'n1n.ai',    family: 'openai',    badge: 'active',    bl: '使用中',     model: 'sd3-medium',   dots: ['f', 'f', 'f'] },
  { ico: 'OA', bg: 'rgba(103,183,255,.12)', col: 'var(--sc)', name: 'OpenAI',    family: 'openai',    badge: 'connected', bl: '已连接',     model: 'gpt-image-1',  dots: ['f', 'f', 'f'] },
  { ico: 'RP', bg: 'rgba(242,184,75,.12)',  col: 'var(--wa)', name: 'Replicate', family: 'replicate', badge: 'error',     bl: '配置不完整', model: 'flux-schnell', dots: ['f', 'w', 'e'] },
];

interface SettingsPageProps {
  onNav: (view: string) => void;
}

export function SettingsPage({ onNav }: SettingsPageProps) {
  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => onNav('main')}>
          <SI d="m15 18-6-6 6-6" />
        </button>
        <div className="hdr-title">Providers</div>
        <button className="hdr-btn tt-wrap" title="添加 Provider" onClick={() => onNav('settings-add')}>
          <SI d="M12 5v14M5 12h14" w={2.5} />
          <div className="tt">添加 Provider</div>
        </button>
      </header>
      <div className="scroll">
        <div className="sec-lbl">已配置</div>
        {PROVS.map(p => (
          <div key={p.name} className="prov-row" onClick={() => onNav('settings-detail')}>
            <div className="prov-ico" style={{ background: p.bg, color: p.col }}>{p.ico}</div>
            <div className="prov-info">
              <div className="prov-name">
                <span>{p.name}</span>
                <span style={{ fontFamily: 'var(--fM)', fontSize: 9, color: 'var(--txd)', background: 'var(--s2)', border: '1px solid var(--bd)', padding: '1px 5px', borderRadius: 3, letterSpacing: '.3px' }}>
                  {p.family}
                </span>
                <span className={`badge ${p.badge}`}>{p.bl}</span>
              </div>
              <div className="prov-model">{p.model}</div>
            </div>
            <div className="completeness">
              {p.dots.map((d, i) => <div key={i} className={`cdot ${d}`} />)}
            </div>
            <SI d="m9 18 6-6-6-6" style={{ color: 'var(--txd)', flexShrink: 0 }} />
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="footer-info">
          <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>imagen-ps v0.1.0</span>
          <div style={{ flex: 1 }} />
          <button style={{ fontSize: 11, color: 'var(--sc)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--fB)' }}>导入</button>
          <button style={{ fontSize: 11, color: 'var(--txd)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--fB)', marginLeft: 8 }}>导出</button>
        </div>
      </div>
    </div>
  );
}

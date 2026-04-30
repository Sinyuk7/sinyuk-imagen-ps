import { useState, useEffect, useRef, useCallback } from 'react';
import { SI } from '../components/icons';
import { Tip } from '../components/tip';
import { CompareSlider } from '../components/compare-slider';

const GRADS = {
  cat:   'linear-gradient(155deg,#1a2035 0%,#2c4060 40%,#1f3830 70%,#1a2a20 100%)',
  rain:  'linear-gradient(155deg,#0d1a2e 0%,#1a2a42 45%,#111e30 100%)',
  mtn:   'linear-gradient(155deg,#1a2a1a 0%,#2a3a25 50%,#1a2520 100%)',
  cyber: 'linear-gradient(155deg,#1a1a2e 0%,#2a1a3a 50%,#1a2030 100%)',
  jazz:  'linear-gradient(155deg,#2a1a10 0%,#3a2a15 50%,#251a10 100%)',
  nord:  'linear-gradient(155deg,#232323 0%,#303030 50%,#252525 100%)',
};
const GRAD_VALS = Object.values(GRADS);

const PS_LAYERS = [
  { id: 'l0', name: 'Layer 0',         meta: '当前 · 1920×1080',   grad: GRADS.cat },
  { id: 'l1', name: 'Layer 1',         meta: '1920×1080 · PNG',    grad: GRADS.rain },
  { id: 'l2', name: 'Background',      meta: '1920×1080 · JPG',    grad: GRADS.nord },
  { id: 'l3', name: 'Overlay',         meta: '透明图层',             grad: GRADS.cyber },
  { id: 'l4', name: 'Shadows',         meta: '混合: Multiply',      grad: GRADS.mtn },
  { id: 'l5', name: 'Highlights',      meta: '混合: Screen',        grad: GRADS.jazz },
  { id: 'l6', name: 'Color Grade',     meta: '调整图层',             grad: GRADS.rain },
  { id: 'l7', name: 'Vignette',        meta: '透明图层',             grad: GRADS.cat },
  { id: 'l8', name: 'Skin Tones',      meta: '色相/饱和度',          grad: GRADS.mtn },
  { id: 'l9', name: 'Background copy', meta: '1920×1080 · JPG',    grad: GRADS.nord },
];

const MODELS = ['Nano Banana 2', 'gpt-image-2', 'flux-1-dev', 'sd3-large-turbo'];

interface SendMode {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const SEND_MODES: SendMode[] = [
  {
    id: 'layer',
    label: '当前图层',
    desc: '自动发送当前选中图层',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  },
  {
    id: 'selection',
    label: '当前选区',
    desc: '发送 PS 当前选区内容',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="1" strokeDasharray="4 2" />
        <path d="M9 9h6v6H9z" fill="currentColor" opacity=".3" />
      </svg>
    ),
  },
  {
    id: 'upload',
    label: '上传图片',
    desc: '通过 + 手动上传图片',
    icon: <SI d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"]} />,
  },
];

interface Attachment {
  id: number;
  type: string;
  name: string;
  grad: string;
}

interface Message {
  id: number;
  time: string;
  prompt: string;
  status: 'ok' | 'err' | 'running';
  provider?: string;
  errMsg?: string;
  elapsed?: string;
  grad?: string;
  refGrad?: string;
  attachments?: Attachment[];
}

const INIT_MSGS: Message[] = [
  {
    id: 10, time: '14:11',
    prompt: 'a futuristic cityscape at dusk, neon reflections on wet streets, cinematic wide shot, 8K',
    status: 'err', provider: 'Replicate', errMsg: '连接超时 (ERR_TIMEOUT)，请检查 API Key 或网络',
  },
  {
    id: 20, time: '14:23',
    prompt: '一只橘猫坐在咖啡馆窗边，窗外是下午的街景和阳光，数字油画风格，暖色调，光线柔和，景深效果，8K 超高清',
    status: 'ok', elapsed: '8.3s', provider: 'n1n.ai', grad: GRADS.cat, refGrad: GRADS.nord,
  },
  {
    id: 30, time: '14:31',
    prompt: '换成更冷的色调，偏蓝灰色，增加窗外雨景，保持同样的构图',
    status: 'running', provider: 'n1n.ai',
  },
];

interface MainPageProps {
  onNav: (view: string) => void;
  model: string;
  setModel: (m: string) => void;
}

export function MainPage({ onNav, model, setModel }: MainPageProps) {
  const [msgs, setMsgs] = useState<Message[]>(INIT_MSGS);
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sendMode, setSendMode] = useState('layer');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<Message | null>(null);
  const [copied, setCopied] = useState<Record<string | number, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const convRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    if (convRef.current) {
      setTimeout(() => { if (convRef.current) convRef.current.scrollTop = 99999; }, 60);
    }
  }, [msgs]);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    const t = setTimeout(() => {
      const g = GRAD_VALS[Math.floor(Math.random() * GRAD_VALS.length)];
      setMsgs(m => m.map(msg =>
        msg.status === 'running'
          ? { ...msg, status: 'ok' as const, elapsed: '4.1s', grad: g, refGrad: GRADS.cat }
          : msg
      ));
      setRunning(false);
      setElapsed(0);
      showToast('生成完成 — 悬停图片可操作');
    }, 4100);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [running, showToast]);

  const canSend = input.trim().length > 0 && !running;

  const handleSend = () => {
    if (!canSend) return;
    const prompt = input.trim();
    setInput('');
    const atts = [...attachments];
    setAttachments([]);
    setRunning(true);
    setElapsed(0);
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const id = Date.now();
    setMsgs(m => [...m, { id, time, prompt, status: 'running', provider: 'n1n.ai', attachments: atts }]);
    setTimeout(() => {
      const g = GRAD_VALS[Math.floor(Math.random() * GRAD_VALS.length)];
      setMsgs(m => m.map(msg =>
        msg.id === id
          ? { ...msg, status: 'ok' as const, elapsed: `${(3 + Math.random()).toFixed(1)}s`, grad: g, refGrad: atts[0]?.grad || GRADS.cat }
          : msg
      ));
      setRunning(false);
      showToast('生成完成');
    }, 4200);
  };

  const addLayer = (layer: typeof PS_LAYERS[0]) => {
    setAttachments(a => [...a, { id: Date.now(), type: 'layer', name: layer.name, grad: layer.grad }]);
    setLayerOpen(false);
    setAttachOpen(false);
  };

  const addFile = () => {
    const fakeGrad = GRAD_VALS[Math.floor(Math.random() * GRAD_VALS.length)];
    setAttachments(a => [...a, { id: Date.now(), type: 'file', name: 'photo.jpg', grad: fakeGrad }]);
    setAttachOpen(false);
    showToast('已添加图片');
  };

  const handleCopy = (id: number | string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => { /* ignore */ });
    setCopied(c => ({ ...c, [id]: true }));
    setTimeout(() => setCopied(c => ({ ...c, [id]: false })), 1500);
    setInput(text);
    taRef.current?.focus();
    showToast('已填入输入框');
  };

  const closeAll = () => {
    setMenuOpen(false);
    setModeOpen(false);
    setAttachOpen(false);
    setLayerOpen(false);
  };

  const curMode = SEND_MODES.find(m => m.id === sendMode);

  return (
    <div className="page" onClick={closeAll}>
      <header className="hdr">
        <Tip label="历史记录">
          <button className="hdr-btn" onClick={e => { e.stopPropagation(); onNav('history'); }}>
            <SI d={["M12 8v4l3 3", "M3.05 11a9 9 0 1 1 .5 4", "M3 16v-5h5"]} />
          </button>
        </Tip>
        <div className="hdr-center">
          <span className="hdr-provider">n1n.ai</span>
          <span className="hdr-model">{model}</span>
        </div>
        <Tip label="Providers" right>
          <button className="hdr-btn" onClick={e => { e.stopPropagation(); onNav('settings'); }}>
            <SI d={["M12 2v2m0 16v2m10-10h-2M4 12H2", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"]} />
          </button>
        </Tip>
      </header>

      <div className="scroll" ref={convRef}>
        <div style={{ padding: '12px 12px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="day-sep">
            <div className="day-sep-line" /><span className="day-sep-lbl">今天</span><div className="day-sep-line" />
          </div>

          {msgs.map(msg => (
            <div key={msg.id}>
              {/* User bubble */}
              <div className="msg-user">
                <div className="user-wrap">
                  <div className="user-bubble">
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="bubble-imgs">
                        {msg.attachments.slice(0, 2).map((a, i) => (
                          <div key={a.id} className="bimg">
                            <div className="bimg-bg" style={{ background: a.grad, width: '100%', height: '100%' }} />
                            {i === 1 && msg.attachments!.length > 2 && (
                              <div className="bimg-count">+{msg.attachments!.length - 1}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="user-prompt">{msg.prompt}</div>
                  </div>
                  <div className="user-meta">
                    <span className="msg-time">{msg.time}</span>
                    <Tip label="复用 Prompt">
                      <button
                        className={`copy-btn${copied[msg.id] ? ' cp' : ''}`}
                        onClick={e => { e.stopPropagation(); handleCopy(msg.id, msg.prompt); }}
                      >
                        {copied[msg.id]
                          ? <SI d="M20 6 9 17l-5-5" w={2.5} />
                          : <SI d={["M8 8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H8z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"]} />
                        }
                      </button>
                    </Tip>
                  </div>
                </div>
              </div>

              {/* Error response */}
              {msg.status === 'err' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <div className="av-prov err" style={{ fontSize: 13, fontWeight: 700 }}>!</div>
                  <div className="err-card">
                    <div className="err-top">
                      <span className="sdot err" />
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--er)', fontFamily: 'var(--fM)' }}>
                        失败 · {msg.provider}
                      </span>
                    </div>
                    <div className="err-msg">{msg.errMsg}</div>
                    <button className="err-retry">重试</button>
                  </div>
                </div>
              )}

              {/* Running response */}
              {msg.status === 'running' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <div className="av-prov">N</div>
                  <div className="prov-card">
                    <div className="prov-top">
                      <span className="prov-name-lbl">{msg.provider || 'n1n.ai'}</span>
                      <div className="prov-status">
                        <span className="sdot run" />
                        <span style={{ color: 'var(--wa)' }}>{elapsed}s</span>
                      </div>
                    </div>
                    <div className="prov-loading">
                      <div className="ldots"><div className="ldot" /><div className="ldot" /><div className="ldot" /></div>
                      <span style={{ fontFamily: 'var(--fM)', fontSize: 11, color: 'var(--txd)' }}>生成中...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Success response */}
              {msg.status === 'ok' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <div className="av-prov">N</div>
                  <div className="prov-card">
                    <div className="prov-top">
                      <span className="prov-name-lbl">{msg.provider}</span>
                      <div className="prov-status">
                        <span className="sdot ok" />
                        <span style={{ color: 'var(--ok)' }}>{msg.elapsed}</span>
                      </div>
                    </div>
                    <div className="prov-img">
                      <div className="img-result" onClick={e => { e.stopPropagation(); setLightbox(msg); }}>
                        <div className="img-bg" style={{ height: 158, background: msg.grad }} />
                        <div className="img-meta">1024 × 1024 · PNG</div>
                        <div className="img-overlay">
                          <button className="img-act prim" onClick={e => { e.stopPropagation(); showToast('已置入 Photoshop 画布'); }}>
                            <SI d={["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z", "M17 21V13H7v8", "M7 3v5h8"]} />
                            置入 PS
                          </button>
                          <button className="img-act sec" onClick={e => { e.stopPropagation(); showToast('下载中...'); }}>
                            <SI d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"]} />
                          </button>
                          <button className="img-act sec" onClick={e => { e.stopPropagation(); setLightbox(msg); }}>
                            <SI d={["M8 3H5a2 2 0 0 0-2 2v3", "M21 8V5a2 2 0 0 0-2-2h-3", "M3 16v3a2 2 0 0 0 2 2h3", "M16 21h3a2 2 0 0 0 2-2v-3"]} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="prov-actions">
                      <Tip label="置入 PS">
                        <button className="act-ico prim" onClick={e => { e.stopPropagation(); showToast('已置入 Photoshop 画布'); }}>
                          <SI d={["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z", "M17 21V13H7v8", "M7 3v5h8"]} />
                        </button>
                      </Tip>
                      <Tip label="重新生成">
                        <button className="act-ico" onClick={e => { e.stopPropagation(); showToast('重新生成...'); }}>
                          <SI d={["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"]} />
                        </button>
                      </Tip>
                      <Tip label="复制 Prompt">
                        <button className="act-ico" onClick={e => { e.stopPropagation(); handleCopy(msg.id + 'x', msg.prompt); }}>
                          <SI d={["M8 8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H8z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"]} />
                        </button>
                      </Tip>
                      <Tip label="下载">
                        <button className="act-ico" onClick={e => { e.stopPropagation(); showToast('下载中...'); }}>
                          <SI d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"]} />
                        </button>
                      </Tip>
                      <div className="act-sep" />
                      <button className="act-ico" onClick={e => e.stopPropagation()}>
                        <SI d="M5 12h.01M12 12h.01M19 12h.01" w={2.5} style={{ strokeLinecap: 'round' } as React.CSSProperties} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <footer className="composer" onClick={e => e.stopPropagation()}>
        {/* Layer list popup */}
        {layerOpen && (
          <div className="layer-list-wrap" onClick={e => e.stopPropagation()}>
            <div className="layer-list-hdr">
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--txd)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={() => setLayerOpen(false)}
              >
                <SI d="m15 18-6-6 6-6" sz={12} />
              </button>
              PS 图层
            </div>
            <div className="layer-scroll">
              {PS_LAYERS.map(l => (
                <div key={l.id} className="layer-item" onClick={() => addLayer(l)}>
                  <div className="layer-swatch" style={{ background: l.grad }} />
                  <span className="layer-name">{l.name}</span>
                  <span className="layer-meta-lbl">{l.meta}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attach picker */}
        {attachOpen && !layerOpen && (
          <div className="attach-picker" onClick={e => e.stopPropagation()}>
            <div className="attach-opt" onClick={() => setLayerOpen(true)}>
              <div style={{ width: 28, height: 28, borderRadius: 'var(--rsm)', background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txm)' }}>
                <SI d={["M1 6l11 7 11-7", "M1 6v12a1 1 0 0 0 1 1h20a1 1 0 0 0 1-1V6"]} sz={13} />
              </div>
              <div>
                <div className="attach-opt-label">从 PS 图层选择</div>
                <div className="attach-opt-sub">{PS_LAYERS.length} 个图层</div>
              </div>
              <SI d="m9 18 6-6-6-6" style={{ color: 'var(--txd)', marginLeft: 'auto' }} />
            </div>
            <div className="attach-opt" onClick={addFile}>
              <div style={{ width: 28, height: 28, borderRadius: 'var(--rsm)', background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txm)' }}>
                <SI d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"]} sz={13} />
              </div>
              <div>
                <div className="attach-opt-label">从电脑上传</div>
                <div className="attach-opt-sub">PNG / JPG / WebP</div>
              </div>
            </div>
          </div>
        )}

        {/* Send mode dropdown */}
        {modeOpen && (
          <div className="mode-menu" onClick={e => e.stopPropagation()}>
            {SEND_MODES.map(m => (
              <div
                key={m.id}
                className={`mode-opt${sendMode === m.id ? ' act' : ''}`}
                onClick={() => { setSendMode(m.id); setModeOpen(false); }}
              >
                <div className="mode-icon-wrap">{m.icon}</div>
                <div style={{ flex: 1 }}>
                  <div className="mode-info-name">{m.label}</div>
                  <div className="mode-info-desc">{m.desc}</div>
                </div>
                {sendMode === m.id && <SI d="M20 6 9 17l-5-5" w={2.5} style={{ color: 'var(--pr)', flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        )}

        {/* Model menu */}
        {menuOpen && (
          <div className="model-menu" onClick={e => e.stopPropagation()}>
            {MODELS.map(m => (
              <div
                key={m}
                className={`model-opt${m === model ? ' act' : ''}`}
                onClick={() => { setModel(m); setMenuOpen(false); }}
              >
                {m === model && <SI d="M20 6 9 17l-5-5" w={2.5} style={{ color: 'var(--pr)' }} />}
                <span>{m}</span>
              </div>
            ))}
          </div>
        )}

        <div className={`cmp-inner${running ? ' off' : ''}`}>
          {/* Attachment row */}
          {attachments.length > 0 && (
            <div className="attach-row">
              {attachments.map(a => (
                <div key={a.id} className="att-thumb">
                  <div style={{ width: '100%', height: '100%', background: a.grad }} />
                  <button className="att-rm" onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}>×</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={taRef}
            className="cmp-ta"
            placeholder="描述你想要生成的图像..."
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={running}
          />
          <div className="cmp-bar">
            <Tip label="添加图片">
              <button
                className={`cmp-add${attachOpen || layerOpen ? ' open' : ''}`}
                onClick={e => { e.stopPropagation(); setAttachOpen(o => !o); setLayerOpen(false); setModeOpen(false); setMenuOpen(false); }}
              >
                <SI d="M12 5v14M5 12h14" w={2.5} />
              </button>
            </Tip>
            <div
              className={`cmp-chip${menuOpen ? ' open' : ''}`}
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); setModeOpen(false); setAttachOpen(false); setLayerOpen(false); }}
            >
              <span className="cmp-dot" />
              <span>{model}</span>
              <SI sz={9} d="m6 9 6 6 6-6" />
            </div>
            <div className="cmp-sp" />
            <div className="send-wrap">
              <button className="cmp-send" disabled={!canSend} onClick={handleSend} title={curMode?.label}>
                {running
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 1 1-9-9" /></svg>
                  : curMode?.icon
                }
              </button>
              <button
                className="cmp-send-chev"
                disabled={running}
                onClick={e => { e.stopPropagation(); setModeOpen(o => !o); setMenuOpen(false); setAttachOpen(false); setLayerOpen(false); }}
              >
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>
          </div>
        </div>
      </footer>

      {lightbox && (
        <CompareSlider
          gradA={lightbox.refGrad ?? GRADS.nord}
          gradB={lightbox.grad ?? GRADS.cat}
          onClose={() => setLightbox(null)}
          onPlace={() => { showToast('已置入 Photoshop 画布'); setLightbox(null); }}
          onDownload={() => showToast('下载中...')}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

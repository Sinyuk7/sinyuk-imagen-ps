// ps-pages.jsx — History, Settings, SettingsAdd, SettingsDetail
// Exported to window for use in main script

const { useState } = React;

const _SI = ({d, sz=14, w=2, style, className, ...p}) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} style={style} className={className} {...p}>
    {Array.isArray(d) ? d.map((x,i)=><path key={i} d={x}/>) : <path d={d}/>}
  </svg>
);

// ── History ───────────────────────────────────────────────────────────
const HIST_DATA = [
  {id:1,st:'run',prompt:'换成更冷的色调，偏蓝灰色，增加窗外雨景，保持同样的构图',prov:'n1n.ai',time:'14:31',date:'今天',grad:null},
  {id:2,st:'ok', prompt:'一只橘猫坐在咖啡馆窗边，窗外是下午的街景和阳光，数字油画风格，暖色调',prov:'n1n.ai',time:'14:23',date:'今天',grad:'linear-gradient(155deg,#1a2035 0%,#2c4060 40%,#1f3830 70%,#1a2a20 100%)'},
  {id:3,st:'err',prompt:'a futuristic cityscape at dusk, neon reflections on wet streets, cinematic',prov:'Replicate',time:'14:11',date:'今天',grad:null},
  {id:4,st:'ok', prompt:'山间清晨，薄雾缭绕，水墨画风格，留白，极简构图',prov:'OpenAI',time:'09:48',date:'今天',grad:'linear-gradient(155deg,#1a2a1a 0%,#2a3a25 50%,#1a2520 100%)'},
  {id:5,st:'ok', prompt:'portrait of a cyberpunk hacker girl, glowing implants, dark alley background',prov:'n1n.ai',time:'22:14',date:'昨天',grad:'linear-gradient(155deg,#1a1a2e 0%,#2a1a3a 50%,#1a2030 100%)'},
  {id:6,st:'ok', prompt:'复古海报风格，爵士乐演出，霓虹灯，1960年代纽约',prov:'n1n.ai',time:'19:33',date:'昨天',grad:'linear-gradient(155deg,#2a1a10 0%,#3a2a15 50%,#251a10 100%)'},
  {id:7,st:'err',prompt:'abstract fluid art, vibrant colors, 8k resolution, trending on artstation',prov:'Replicate',time:'15:02',date:'昨天',grad:null},
  {id:8,st:'ok', prompt:'白色极简主义室内设计，落地窗，下午阳光，北欧风格',prov:'OpenAI',time:'10:17',date:'昨天',grad:'linear-gradient(155deg,#232323 0%,#303030 50%,#252525 100%)'},
];

function HistoryPage({ onNav }) {
  const [filter, setFilter] = useState('all');
  const filters = [['all','全部'],['ok','完成'],['run','运行中'],['err','失败']];
  const filtered = filter==='all' ? HIST_DATA : HIST_DATA.filter(t=>t.st===filter);
  const groups = {};
  filtered.forEach(t => { if(!groups[t.date]) groups[t.date]=[]; groups[t.date].push(t); });
  const stC = {ok:'var(--ok)',run:'var(--wa)',err:'var(--er)'};
  const stL = {ok:'完成',run:'运行中',err:'失败'};

  return (
    <div className="page page-enter" data-screen-label="02 History">
      <header className="hdr">
        <button className="hdr-btn" onClick={()=>onNav('main')}><_SI d="m15 18-6-6 6-6"/></button>
        <div className="hdr-title">历史</div>
        <div style={{width:32}}/>
      </header>
      <div className="filter-bar">
        {filters.map(([k,l]) => (
          <button key={k} className={`fchip${filter===k?' act':''}`} onClick={()=>setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="scroll">
        {filtered.length === 0
          ? <div style={{padding:'40px 16px',textAlign:'center',color:'var(--txd)',fontSize:12}}>暂无记录</div>
          : Object.entries(groups).map(([date,tasks]) => (
            <div key={date}>
              <div className="date-lbl">{date}</div>
              {tasks.map(t => (
                <div key={t.id} className="task-row" onClick={()=>onNav('main')}>
                  <div className="task-thumb">
                    {t.st==='ok'&&t.grad
                      ? <div style={{width:'100%',height:'100%',background:t.grad,borderRadius:'inherit'}}/>
                      : t.st==='run'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wa)" strokeWidth="1.5" className="spin"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--er)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
                    }
                  </div>
                  <div className="task-info">
                    <div className="task-prompt">{t.prompt}</div>
                    <div className="task-meta">
                      <span style={{fontFamily:'var(--fM)',fontSize:10,color:'var(--txd)'}}>{t.prov}</span>
                      <span style={{color:'var(--bd2)'}}>·</span>
                      <span style={{fontFamily:'var(--fM)',fontSize:10,color:'var(--txd)'}}>{t.time}</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:3,marginTop:1}}>
                      <span className={`sdot ${t.st}`}></span>
                      <span style={{color:stC[t.st],fontSize:10}}>{stL[t.st]}</span>
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

// ── Settings Home ─────────────────────────────────────────────────────
const PROVS = [
  {ico:'N', bg:'rgba(120,231,192,.12)',col:'var(--pr)',  name:'n1n.ai',   family:'openai',    badge:'active',    bl:'使用中',     model:'sd3-medium', dots:['f','f','f']},
  {ico:'OA',bg:'rgba(103,183,255,.12)',col:'var(--sc)',  name:'OpenAI',   family:'openai',    badge:'connected', bl:'已连接',     model:'gpt-image-1',dots:['f','f','f']},
  {ico:'RP',bg:'rgba(242,184,75,.12)', col:'var(--wa)',  name:'Replicate',family:'replicate', badge:'error',     bl:'配置不完整', model:'flux-schnell',dots:['f','w','e']},
];

function SettingsPage({ onNav }) {
  return (
    <div className="page page-enter" data-screen-label="03 Settings">
      <header className="hdr">
        <button className="hdr-btn" onClick={()=>onNav('main')}><_SI d="m15 18-6-6 6-6"/></button>
        <div className="hdr-title">Providers</div>
        <button className="hdr-btn tt-wrap" title="" onClick={()=>onNav('settings-add')}>
          <_SI d="M12 5v14M5 12h14" w={2.5}/>
          <div className="tt">添加 Provider</div>
        </button>
      </header>
      <div className="scroll">
        <div className="sec-lbl">已配置</div>
        {PROVS.map(p => (
          <div key={p.name} className="prov-row" onClick={()=>onNav('settings-detail')}>
            <div className="prov-ico" style={{background:p.bg,color:p.col}}>{p.ico}</div>
            <div className="prov-info">
              <div className="prov-name">
                <span>{p.name}</span>
                <span style={{fontFamily:'var(--fM)',fontSize:9,color:'var(--txd)',background:'var(--s2)',border:'1px solid var(--bd)',padding:'1px 5px',borderRadius:3,letterSpacing:'.3px'}}>{p.family}</span>
                <span className={`badge ${p.badge}`}>{p.bl}</span>
              </div>
              <div className="prov-model">{p.model}</div>
            </div>
            <div className="completeness">{p.dots.map((d,i)=><div key={i} className={`cdot ${d}`}/>)}</div>
            <_SI d="m9 18 6-6-6-6" style={{color:'var(--txd)',flexShrink:0}}/>
          </div>
        ))}
        <div style={{flex:1}}/>
        <div className="footer-info">
          <span style={{fontFamily:'var(--fM)',fontSize:10,color:'var(--txd)'}}>imagen-ps v0.1.0</span>
          <div style={{flex:1}}/>
          <button style={{fontSize:11,color:'var(--sc)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--fB)'}}>导入</button>
          <button style={{fontSize:11,color:'var(--txd)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--fB)',marginLeft:8}}>导出</button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Add (2-step) ─────────────────────────────────────────────
const FAM_OPTS = [
  {id:'openai',    label:'OpenAI Compatible', desc:'支持 OpenAI API 格式', ico:'OA', hasBase:true},
  {id:'replicate', label:'Replicate',          desc:'Replicate 模型平台',   ico:'RP', hasBase:false},
  {id:'fal',       label:'Fal.ai',             desc:'高速推理平台',         ico:'FA', hasBase:false},
  {id:'together',  label:'Together AI',        desc:'开源模型云服务',       ico:'TA', hasBase:false},
];

function SettingsAddPage({ onNav }) {
  const [step, setStep] = useState(1);
  const [fam, setFam] = useState(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testSt, setTestSt] = useState('idle');
  const sel = FAM_OPTS.find(f=>f.id===fam);

  return (
    <div className="page page-enter" data-screen-label="04 AddProvider">
      <header className="hdr">
        <button className="hdr-btn" onClick={()=>step===1?onNav('settings'):setStep(1)}>
          <_SI d="m15 18-6-6 6-6"/>
        </button>
        <div className="hdr-center">
          <span style={{fontFamily:'var(--fD)',fontSize:14,fontWeight:600,color:'var(--tx)'}}>
            {step===1?'添加 Provider':sel?.label}
          </span>
          {step===2 && <span style={{fontFamily:'var(--fM)',fontSize:10,color:'var(--txd)'}}>2 / 2</span>}
        </div>
        <div style={{width:32}}/>
      </header>

      <div className="scroll">
        {step===1 ? (
          <div>
            <div className="sec-lbl" style={{paddingTop:16}}>选择类型</div>
            {FAM_OPTS.map(f => (
              <div key={f.id} className="prov-row" onClick={()=>{setFam(f.id);setStep(2);}}>
                <div className="prov-ico" style={{background:'var(--s2)',color:'var(--txm)',fontFamily:'var(--fM)',fontSize:10}}>{f.ico}</div>
                <div className="prov-info">
                  <div style={{fontSize:13,fontWeight:500,color:'var(--tx)'}}>{f.label}</div>
                  <div style={{fontFamily:'var(--fM)',fontSize:10,color:'var(--txd)',marginTop:2}}>{f.desc}</div>
                </div>
                <_SI d="m9 18 6-6-6-6" style={{color:'var(--txd)'}}/>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="section">
              <div className="section-title">Profile</div>
              <div className="field">
                <label className="field-label">显示名称</label>
                <input className="field-input" placeholder={sel?.label} value={name} onChange={e=>setName(e.target.value)}/>
              </div>
              {sel?.hasBase && (
                <div className="field">
                  <label className="field-label">Base URL</label>
                  <input className="field-input mono" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)}/>
                  <div className="field-hint">兼容 OpenAI API 格式的服务地址</div>
                </div>
              )}
              <div className="field" style={{marginBottom:0}}>
                <label className="field-label">API Key</label>
                <div className="pw-wrap">
                  <input type={showKey?'text':'password'} className="field-input mono" placeholder="sk-..." value={apiKey} onChange={e=>setApiKey(e.target.value)}/>
                  <button className="pw-toggle" onClick={()=>setShowKey(s=>!s)}>
                    <_SI d={showKey?"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24":"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"}/>
                  </button>
                </div>
              </div>
            </div>
            <div className="test-area">
              <button className="test-btn" disabled={testSt==='testing'} onClick={()=>{setTestSt('testing');setTimeout(()=>setTestSt('ok'),1600);}}>
                {testSt==='testing'
                  ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 1 1-9-9"/></svg> 测试中...</>
                  : '测试连接'
                }
              </button>
              {testSt==='ok' && <div className="test-result ok"><_SI d="M20 6 9 17l-5-5" w={2.5}/> 连接成功</div>}
            </div>
          </div>
        )}
      </div>

      {step===2 && (
        <footer className="det-footer">
          <button className="btn-save" onClick={()=>onNav('settings')}>保存</button>
          <button style={{padding:'10px 14px',borderRadius:'var(--rsm)',border:'1px solid var(--bd)',background:'transparent',color:'var(--txm)',fontFamily:'var(--fB)',fontSize:13,cursor:'pointer'}} onClick={()=>onNav('settings')}>取消</button>
        </footer>
      )}
    </div>
  );
}

// ── Settings Detail ───────────────────────────────────────────────────
function SettingsDetailPage({ onNav }) {
  const [showKey, setShowKey] = useState(false);
  const [selMod, setSelMod] = useState('sd3-medium');
  const [selAsp, setSelAsp] = useState('4:3');
  const [steps, setSteps] = useState(30);
  const [cfg, setCfg] = useState(7);
  const [cnt, setCnt] = useState(1);
  const [adv, setAdv] = useState(false);
  const [testSt, setTestSt] = useState('idle');
  const [fmt, setFmt] = useState('PNG');
  const [toast, setToast] = useState(null);
  const showToast = m => { setToast(m); setTimeout(()=>setToast(null),2000); };
  const asps = [{r:'1:1',w:20,h:20},{r:'4:3',w:24,h:18},{r:'16:9',w:28,h:16},{r:'9:16',w:16,h:28}];

  return (
    <div className="page page-enter" data-screen-label="05 ProviderDetail">
      <header className="hdr">
        <button className="hdr-btn" onClick={()=>onNav('settings')}><_SI d="m15 18-6-6 6-6"/></button>
        <div className="hdr-center">
          <span style={{fontFamily:'var(--fD)',fontSize:14,fontWeight:600,color:'var(--tx)'}}>n1n.ai</span>
          <div style={{display:'flex',alignItems:'center',gap:4,fontFamily:'var(--fM)',fontSize:10,color:'var(--ok)'}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:'var(--ok)',display:'inline-block'}}/>
            已连接
          </div>
        </div>
        <button className="hdr-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </button>
      </header>
      <div className="scroll">
        <div className="section">
          <div className="section-title">连接信息</div>
          <div className="field">
            <label className="field-label">API Key</label>
            <div className="pw-wrap">
              <input type={showKey?'text':'password'} className="field-input mono" defaultValue="sk-••••••••••••••••4f2a"/>
              <button className="pw-toggle" onClick={()=>setShowKey(s=>!s)}>
                <_SI d={showKey?"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24":"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"}/>
              </button>
            </div>
          </div>
        </div>
        <div className="section">
          <div className="section-title">默认模型</div>
          <div className="chips">
            {['sd3-medium','sdxl','sd3-large','ultra'].map(m=>(
              <button key={m} className={`chip${m===selMod?' act':''}`} onClick={()=>setSelMod(m)}>{m}</button>
            ))}
          </div>
        </div>
        <div className="section">
          <div className="section-title">生成参数</div>
          <div className="field">
            <label className="field-label">宽高比</label>
            <div className="aspect-grid">
              {asps.map(a=>(
                <button key={a.r} className={`aspect-opt${a.r===selAsp?' act':''}`} onClick={()=>setSelAsp(a.r)}>
                  <div className="aspect-ico" style={{width:a.w,height:a.h}}/>
                  <span className="aspect-lbl">{a.r}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label">Steps</label>
            <div className="slider-wrap">
              <input type="range" className="slider" min="10" max="50" value={steps} onChange={e=>setSteps(+e.target.value)}/>
              <span className="slider-val">{steps}</span>
            </div>
          </div>
          <div className="field">
            <label className="field-label">CFG Scale</label>
            <div className="slider-wrap">
              <input type="range" className="slider" min="1" max="20" step="0.5" value={cfg} onChange={e=>setCfg(+e.target.value)}/>
              <span className="slider-val">{cfg.toFixed(1)}</span>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:12,fontWeight:500,color:'var(--txm)',flex:1}}>输出数量</span>
            <div style={{display:'flex',gap:4}}>
              {[1,2,4].map(n=><button key={n} className={`param-val${n===cnt?' act':''}`} onClick={()=>setCnt(n)}>{n}</button>)}
            </div>
          </div>
        </div>
        <button className="adv-toggle" onClick={()=>setAdv(o=>!o)}>
          <_SI d={["M12 2v2m0 16v2m10-10h-2M4 12H2","M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"]}/>
          高级参数
          <span className={`adv-chev${adv?' open':''}`}><_SI sz={10} d="m6 9 6 6 6-6"/></span>
        </button>
        <div className="adv-body" style={{maxHeight:adv?240:0}}>
          <div className="section" style={{borderTop:'none'}}>
            <div className="field">
              <label className="field-label">Seed</label>
              <input type="number" className="field-input mono" placeholder="留空 = 随机"/>
              <div className="field-hint">固定 seed 可复现结果</div>
            </div>
            <div className="field" style={{marginBottom:0}}>
              <label className="field-label">输出格式</label>
              <div className="chips">
                {['PNG','JPEG','WebP'].map(f=><button key={f} className={`chip${f===fmt?' act':''}`} onClick={()=>setFmt(f)}>{f}</button>)}
              </div>
            </div>
          </div>
        </div>
        <div className="test-area">
          <button className="test-btn" disabled={testSt==='testing'} onClick={()=>{setTestSt('testing');setTimeout(()=>setTestSt('ok'),1600);}}>
            {testSt==='testing'
              ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 1 1-9-9"/></svg> 测试中...</>
              : <><_SI d="M5 12h14M12 5l7 7-7 7"/> 测试连接</>
            }
          </button>
          {testSt==='ok' && <div className="test-result ok"><_SI d="M20 6 9 17l-5-5" w={2.5}/> 连接成功 · 余额 $12.40</div>}
        </div>
      </div>
      <footer className="det-footer">
        <button className="btn-save" onClick={()=>{showToast('已保存');onNav('settings');}}>保存</button>
        <button className="btn-del">
          <_SI d={["M3 6h18","M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6","M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"]}/>
        </button>
      </footer>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

Object.assign(window, { HistoryPage, SettingsPage, SettingsAddPage, SettingsDetailPage });

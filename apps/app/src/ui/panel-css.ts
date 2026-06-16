export const PANEL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root {
  --bg:#0D1117; --s1:#151A22; --s2:#1C2330; --s3:#242C3B;
  --bd:#2E3748; --bd2:#3A4457;
  --tx:#E9EDF4; --txm:#A6B0BF; --txd:#738093; --txi:#0D1117;
  --pr:#78E7C0; --prh:#8AF0CC; --pra:#58D9AF; --prs:rgba(120,231,192,.14);
  --sc:#67B7FF; --scs:rgba(103,183,255,.14);
  --ok:#63D48F; --oks:rgba(99,212,143,.14);
  --wa:#F2B84B; --was:rgba(242,184,75,.14);
  --er:#F26D6D; --ers:rgba(242,109,109,.14);
  --hv:rgba(255,255,255,.05); --ac:rgba(255,255,255,.09);
  --rsm:8px; --rmd:12px; --rxl:20px; --rfl:9999px;
  --fD:'Space Grotesk',sans-serif; --fB:'IBM Plex Sans',sans-serif; --fM:'IBM Plex Mono',monospace;
  --eo:cubic-bezier(.2,0,0,1); --tmi:80ms; --tsh:160ms;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{
  min-height:100vh; background:#060A0F;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--fB); -webkit-font-smoothing:antialiased;
}
#root{ display:flex; align-items:center; justify-content:center; min-height:100vh; }

.panel{
  width:380px; height:640px; background:var(--bg); color:var(--tx);
  font-size:14px; line-height:20px; overflow:hidden;
  display:flex; flex-direction:column; position:relative;
  border-radius:4px;
  box-shadow:0 0 0 1px rgba(255,255,255,.06),0 24px 64px rgba(0,0,0,.7);
}

/* Pages */
.page{ position:absolute; inset:0; display:flex; flex-direction:column; background:var(--bg); }
.page-enter{ animation:pgIn var(--tsh) var(--eo) both; }
@keyframes pgIn{ from{opacity:0;transform:translateX(14px)} to{opacity:1;transform:none} }

/* Header */
.hdr{
  height:48px; background:var(--s1); border-bottom:1px solid var(--bd);
  display:flex; align-items:center; padding:0 12px; gap:8px; flex-shrink:0; z-index:10;
}
.hdr-btn{
  width:32px; height:32px; border-radius:var(--rsm); border:none;
  background:transparent; color:var(--txm); cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:background var(--tmi),color var(--tmi);
}
.hdr-btn:hover{ background:var(--hv); color:var(--tx); }
.hdr-center{ flex:1; display:flex; flex-direction:column; align-items:center; gap:1px; }
.hdr-provider{ font-family:var(--fM); font-size:10px; color:var(--txd); letter-spacing:.4px; }
.hdr-model{ font-family:var(--fM); font-size:12px; font-weight:500; color:var(--pr); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; }
.hdr-title{ flex:1; font-family:var(--fD); font-size:14px; font-weight:600; color:var(--tx); text-align:center; }

/* Scroll */
.scroll{ overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--bd) transparent; flex:1; }
.scroll::-webkit-scrollbar{ width:3px; }
.scroll::-webkit-scrollbar-thumb{ background:var(--bd); border-radius:2px; }

/* Tooltip */
.tt-wrap{ position:relative; display:inline-flex; }
.tt{
  position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%);
  background:var(--s3); border:1px solid var(--bd2);
  padding:3px 8px; border-radius:5px;
  font-family:var(--fM); font-size:10px; color:var(--txm); letter-spacing:.3px;
  white-space:nowrap; opacity:0; pointer-events:none;
  transition:opacity var(--tmi); z-index:300;
}
.tt::after{
  content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%);
  border:4px solid transparent; border-top-color:var(--bd2);
}
.tt-wrap:hover .tt{ opacity:1; }

/* Day separator */
.day-sep{ display:flex; align-items:center; gap:8px; padding:8px 0; }
.day-sep-line{ flex:1; height:1px; background:var(--bd); }
.day-sep-lbl{ font-family:var(--fM); font-size:10px; color:var(--txd); padding:0 4px; }

/* USER bubble (right) */
.msg-user{ display:flex; justify-content:flex-end; padding:3px 0; }
.user-wrap{ max-width:82%; display:flex; flex-direction:column; align-items:flex-end; gap:3px; }
.user-bubble{ background:var(--s3); border-radius:14px 14px 3px 14px; padding:9px 13px; }
.bubble-imgs{ display:flex; gap:4px; margin-bottom:6px; }
.bimg{
  position:relative; width:52px; height:52px; border-radius:8px;
  overflow:hidden; border:1px solid var(--bd); flex-shrink:0;
}
.bimg-bg{ width:100%; height:100%; }
.bimg-count{
  position:absolute; inset:0; background:rgba(0,0,0,.6);
  display:flex; align-items:center; justify-content:center;
  font-family:var(--fM); font-size:12px; font-weight:600; color:#fff;
}
.user-prompt{
  font-size:13px; line-height:18px; color:var(--tx);
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  text-wrap:pretty;
}
.user-meta{ display:flex; align-items:center; gap:6px; padding-right:2px; }
.msg-time{ font-family:var(--fM); font-size:10px; color:var(--txd); }
.copy-btn{
  width:20px; height:20px; border-radius:5px; border:none;
  background:transparent; color:var(--txd); cursor:pointer;
  display:flex; align-items:center; justify-content:center; transition:all var(--tmi);
}
.copy-btn:hover{ background:var(--hv); color:var(--txm); }
.copy-btn.cp{ color:var(--ok); }

/* PROVIDER bubble (left) */
.msg-prov{ display:flex; gap:8px; align-items:flex-start; padding:3px 0; }
.av-prov{
  width:28px; height:28px; border-radius:50%; flex-shrink:0; margin-top:1px;
  background:rgba(103,183,255,.12);
  display:flex; align-items:center; justify-content:center;
  font-family:var(--fM); font-size:11px; font-weight:600; color:var(--sc);
}
.av-prov.err{ background:var(--ers); color:var(--er); }
.prov-card{
  flex:1; min-width:0;
  background:var(--s1); border:1px solid var(--bd);
  border-radius:3px 14px 14px 14px; overflow:hidden;
}
.prov-top{ display:flex; align-items:center; justify-content:space-between; padding:7px 12px 5px; }
.prov-name-lbl{ font-family:var(--fM); font-size:10px; font-weight:500; color:var(--txd); letter-spacing:.3px; }
.prov-status{ display:flex; align-items:center; gap:4px; font-family:var(--fM); font-size:10px; font-weight:500; }
.sdot{ width:5px; height:5px; border-radius:50%; }
.sdot.ok{ background:var(--ok); }
.sdot.run{ background:var(--wa); animation:pulse 1.2s ease-in-out infinite; }
.sdot.err{ background:var(--er); }
@keyframes pulse{ 0%,100%{opacity:1}50%{opacity:.35} }

/* Image result */
.prov-img{ border-top:1px solid var(--bd); position:relative; overflow:hidden; }
.img-result{ width:100%; height:160px; position:relative; cursor:pointer; }
.img-bg{ width:100%; height:100%; display:block; }
.img-overlay{
  position:absolute; inset:0;
  background:linear-gradient(to top,rgba(7,10,15,.9) 0%,transparent 55%);
  opacity:0; transition:opacity var(--tmi);
  display:flex; align-items:flex-end; padding:8px; gap:5px;
}
.img-result:hover .img-overlay{ opacity:1; }
.img-meta{
  position:absolute; top:8px; right:8px;
  font-family:var(--fM); font-size:9px; color:rgba(255,255,255,.7);
  background:rgba(0,0,0,.5); padding:2px 6px; border-radius:4px;
  opacity:0; transition:opacity var(--tmi); pointer-events:none;
}
.img-result:hover .img-meta{ opacity:1; }
.img-act{
  display:flex; align-items:center; gap:5px;
  padding:4px 10px; border-radius:var(--rfl); border:none;
  font-family:var(--fB); font-size:11px; font-weight:600; cursor:pointer; transition:all var(--tmi);
}
.img-act.prim{ background:var(--pr); color:var(--txi); }
.img-act.prim:hover{ background:var(--prh); }
.img-act.sec{ background:rgba(255,255,255,.13); color:var(--tx); backdrop-filter:blur(4px); }
.img-act.sec:hover{ background:rgba(255,255,255,.22); }

/* Loading */
.prov-loading{ display:flex; align-items:center; gap:10px; padding:10px 12px; }
.ldots{ display:flex; gap:4px; }
.ldot{ width:5px; height:5px; border-radius:50%; background:var(--pr); animation:lb 1.2s ease-in-out infinite; }
.ldot:nth-child(2){animation-delay:.2s} .ldot:nth-child(3){animation-delay:.4s}
@keyframes lb{ 0%,100%{transform:translateY(0);opacity:.6}50%{transform:translateY(-4px);opacity:1} }

/* Action row */
.prov-actions{ border-top:1px solid var(--bd); padding:1px 8px; display:flex; align-items:center; gap:1px; }
.act-ico{
  width:30px; height:30px; border-radius:var(--rsm); border:none;
  background:transparent; color:var(--txd); cursor:pointer;
  display:flex; align-items:center; justify-content:center; transition:all var(--tmi);
}
.act-ico:hover{ background:var(--hv); color:var(--txm); }
.act-ico.prim{ color:var(--pr); }
.act-ico.prim:hover{ background:var(--prs); }
.act-sep{ flex:1; }

/* Error */
.err-card{
  flex:1; min-width:0;
  background:rgba(242,109,109,.06); border:1px solid rgba(242,109,109,.2);
  border-radius:3px 14px 14px 14px; padding:10px 12px;
  display:flex; flex-direction:column; gap:5px;
}
.err-top{ display:flex; align-items:center; gap:5px; }
.err-msg{ font-size:12px; color:var(--txm); line-height:16px; padding-left:14px; }
.err-retry{
  align-self:flex-start; padding:3px 10px; border-radius:var(--rsm);
  border:1px solid rgba(242,109,109,.35); background:transparent;
  color:var(--er); font-size:11px; font-weight:500; cursor:pointer; font-family:var(--fB);
  margin-left:14px; transition:all var(--tmi);
}
.err-retry:hover{ background:var(--ers); }

/* Empty */
.conv-empty{
  flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:14px; padding:24px; text-align:center;
}
.empty-hints{ display:flex; flex-direction:column; gap:5px; width:100%; max-width:270px; margin-top:4px; }
.empty-hint{
  background:var(--s2); border:1px solid var(--bd); border-radius:var(--rmd);
  padding:7px 12px; font-size:12px; color:var(--txm); text-align:left; cursor:pointer;
  transition:all var(--tmi); font-family:var(--fB); line-height:16px;
}
.empty-hint:hover{ border-color:var(--bd2); color:var(--tx); background:var(--s3); }

/* Composer */
.composer{
  flex-shrink:0; padding:8px 12px 12px; background:var(--bg);
  border-top:1px solid var(--bd); position:relative;
}

/* Attachment row */
.attach-row{
  display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; flex-wrap:nowrap;
}
.attach-row::-webkit-scrollbar{ display:none; }
.att-thumb{
  position:relative; width:52px; height:52px; border-radius:8px;
  overflow:hidden; border:1px solid var(--bd); flex-shrink:0;
}
.att-rm{
  position:absolute; top:2px; right:2px; width:16px; height:16px; border-radius:50%;
  background:rgba(0,0,0,.75); color:white; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; font-size:11px; line-height:1;
  transition:background var(--tmi);
}
.att-rm:hover{ background:var(--er); }

/* Model menu */
.model-menu{
  position:absolute; bottom:calc(100% + 4px); left:50%; transform:translateX(-50%);
  background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rmd);
  overflow:hidden; min-width:210px; box-shadow:0 8px 24px rgba(0,0,0,.45); z-index:200;
}
.model-opt{
  padding:8px 12px; font-family:var(--fM); font-size:12px; color:var(--txm);
  cursor:pointer; transition:background var(--tmi); display:flex; align-items:center; gap:8px;
}
.model-opt:hover{ background:var(--hv); color:var(--tx); }
.model-opt.act{ color:var(--pr); }

/* Send mode menu */
.mode-menu{
  position:absolute; bottom:calc(100% + 4px); right:12px;
  background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rmd);
  overflow:hidden; width:236px; box-shadow:0 8px 24px rgba(0,0,0,.45); z-index:200;
}
.mode-opt{
  display:flex; align-items:center; gap:10px; padding:9px 14px;
  cursor:pointer; transition:background var(--tmi); border-bottom:1px solid var(--bd);
}
.mode-opt:last-child{ border-bottom:none; }
.mode-opt:hover{ background:var(--hv); }
.mode-opt.act{ background:var(--prs); }
.mode-icon-wrap{
  width:28px; height:28px; border-radius:var(--rsm); flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  background:var(--s2); color:var(--txm);
}
.mode-opt.act .mode-icon-wrap{ background:rgba(120,231,192,.15); color:var(--pr); }
.mode-info-name{ font-size:12px; font-weight:600; color:var(--tx); }
.mode-info-desc{ font-size:10px; color:var(--txd); margin-top:1px; font-family:var(--fM); }
.mode-opt.act .mode-info-name{ color:var(--pr); }

/* Attach picker */
.attach-picker{
  position:absolute; bottom:calc(100% + 4px); left:12px;
  background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rmd);
  overflow:hidden; width:196px; box-shadow:0 8px 24px rgba(0,0,0,.45); z-index:200;
}
.attach-opt{
  display:flex; align-items:center; gap:10px; padding:10px 14px;
  cursor:pointer; transition:background var(--tmi); border-bottom:1px solid var(--bd);
}
.attach-opt:last-child{ border-bottom:none; }
.attach-opt:hover{ background:var(--hv); }
.attach-opt-label{ font-size:12px; font-weight:500; color:var(--tx); }
.attach-opt-sub{ font-size:10px; color:var(--txd); font-family:var(--fM); margin-top:1px; }

/* Layer list */
.layer-list-wrap{
  position:absolute; bottom:calc(100% + 4px); left:12px;
  background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rmd);
  overflow:hidden; width:230px; box-shadow:0 8px 24px rgba(0,0,0,.45); z-index:201;
}
.layer-list-hdr{
  padding:7px 12px; font-size:10px; font-weight:600; color:var(--txd);
  text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid var(--bd);
  display:flex; align-items:center; gap:8px;
}
.layer-scroll{ max-height:240px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--bd) transparent; }
.layer-scroll::-webkit-scrollbar{ width:3px; }
.layer-item{
  display:flex; align-items:center; gap:8px; padding:5px 12px;
  cursor:pointer; transition:background var(--tmi); border-bottom:1px solid rgba(46,55,72,.5);
}
.layer-item:last-child{ border-bottom:none; }
.layer-item:hover{ background:var(--hv); }
.layer-swatch{ width:24px; height:24px; border-radius:4px; flex-shrink:0; border:1px solid var(--bd); }
.layer-name{ font-size:12px; color:var(--tx); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.layer-meta-lbl{ font-family:var(--fM); font-size:9px; color:var(--txd); white-space:nowrap; }

/* Composer inner */
.cmp-inner{
  background:var(--s2); border:1px solid var(--bd); border-radius:var(--rxl);
  padding:9px 12px; display:flex; flex-direction:column; gap:8px;
  transition:border-color var(--tsh),opacity var(--tsh);
}
.cmp-inner:focus-within{ border-color:var(--bd2); }
.cmp-inner.off{ opacity:.38; pointer-events:none; }
.cmp-ta{
  background:transparent; border:none; outline:none;
  color:var(--tx); font-family:var(--fB); font-size:13px; line-height:18px;
  resize:none; min-height:34px; max-height:72px; overflow-y:auto;
  scrollbar-width:thin; width:100%;
}
.cmp-ta::placeholder{ color:var(--txd); }
.cmp-bar{ display:flex; align-items:center; gap:6px; }

/* + attach button */
.cmp-add{
  width:30px; height:30px; border-radius:var(--rsm); border:1px solid var(--bd);
  background:transparent; color:var(--txm); cursor:pointer; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  transition:all var(--tmi);
}
.cmp-add:hover{ background:var(--hv); border-color:var(--bd2); color:var(--tx); }
.cmp-add.open{ border-color:var(--pr); color:var(--pr); background:var(--prs); }

/* Model chip */
.cmp-chip{
  display:flex; align-items:center; gap:4px; padding:3px 8px; border-radius:var(--rfl);
  border:1px solid var(--bd); background:var(--s1);
  font-family:var(--fM); font-size:10px; color:var(--txm);
  cursor:pointer; transition:all var(--tmi); white-space:nowrap; user-select:none;
}
.cmp-chip:hover{ border-color:var(--bd2); color:var(--tx); }
.cmp-chip.open{ border-color:var(--pr); color:var(--pr); }
.cmp-dot{ width:5px; height:5px; border-radius:50%; background:var(--pr); }
.cmp-sp{ flex:1; }

/* Split send button */
.send-wrap{ display:flex; align-items:stretch; border-radius:var(--rsm); overflow:hidden; flex-shrink:0; }
.cmp-send{
  width:36px; height:36px; border:none;
  background:var(--pr); color:var(--txi); cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:all var(--tmi) var(--eo);
}
.cmp-send:hover{ background:var(--prh); }
.cmp-send:active{ background:var(--pra); transform:scale(.96); }
.cmp-send:disabled{ opacity:.35; cursor:not-allowed; }
.cmp-send-chev{
  width:16px; height:36px; border:none; border-left:1px solid rgba(0,0,0,.15);
  background:var(--pr); color:rgba(0,0,0,.45); cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:all var(--tmi);
}
.cmp-send-chev:hover{ background:var(--prh); color:rgba(0,0,0,.75); }
.cmp-send:disabled~.cmp-send-chev{ opacity:.35; cursor:not-allowed; }

/* Compare Lightbox */
.lightbox{
  position:fixed; inset:0; background:rgba(0,0,0,.92); z-index:1000;
  display:flex; align-items:center; justify-content:center;
  animation:pgIn var(--tsh) var(--eo) both;
}
.lb-inner{ position:relative; display:flex; flex-direction:column; align-items:center; gap:12px; }
.lb-close{
  position:absolute; top:-42px; right:0;
  background:transparent; border:none; color:rgba(255,255,255,.4);
  cursor:pointer; font-size:26px; line-height:1; transition:color var(--tmi);
}
.lb-close:hover{ color:#fff; }
.compare-wrap{
  position:relative; width:500px; height:500px; border-radius:var(--rmd);
  overflow:hidden; user-select:none; border:1px solid var(--bd);
}
.cmp-layer{ position:absolute; inset:0; }
.cmp-divider{
  position:absolute; top:0; bottom:0; width:2px;
  background:rgba(255,255,255,.9); transform:translateX(-50%);
  pointer-events:none;
}
.cmp-handle{
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  width:36px; height:36px; border-radius:50%; background:white;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 2px 10px rgba(0,0,0,.4);
}
.cmp-lbl{
  position:absolute; top:10px;
  background:rgba(0,0,0,.55); padding:2px 8px; border-radius:4px;
  font-family:var(--fM); font-size:10px; color:white; letter-spacing:.3px;
}
.lb-actions{ display:flex; gap:8px; }
.lb-btn{
  padding:8px 20px; border-radius:var(--rsm); border:none;
  font-family:var(--fB); font-size:12px; font-weight:600; cursor:pointer;
  display:flex; align-items:center; gap:6px; transition:all var(--tmi);
}
.lb-btn.prim{ background:var(--pr); color:var(--txi); }
.lb-btn.prim:hover{ background:var(--prh); }
.lb-btn.sec{ background:var(--s3); color:var(--txm); }
.lb-btn.sec:hover{ background:var(--bd2); color:var(--tx); }

/* Toast */
.toast{
  position:absolute; bottom:72px; left:50%; transform:translateX(-50%);
  background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rsm);
  padding:6px 14px; font-size:11px; color:var(--txm); white-space:nowrap;
  box-shadow:0 8px 24px rgba(0,0,0,.5); z-index:2000; pointer-events:none;
  animation:toastIn 140ms var(--eo) both;
}
@keyframes toastIn{ from{opacity:0;transform:translateX(-50%) translateY(6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
@keyframes spin{ to{transform:rotate(360deg)} }
.spin{ animation:spin 1s linear infinite; }

/* History / Settings shared */
.filter-bar{ display:flex; gap:8px; padding:8px 12px; border-bottom:1px solid var(--bd); background:var(--s1); flex-shrink:0; overflow-x:auto; scrollbar-width:none; }
.filter-bar::-webkit-scrollbar{ display:none; }
.fchip{ padding:4px 12px; border-radius:var(--rfl); border:1px solid var(--bd); background:transparent; color:var(--txd); font-family:var(--fB); font-size:11px; font-weight:500; cursor:pointer; white-space:nowrap; transition:all var(--tmi) var(--eo); }
.fchip:hover{ border-color:var(--bd2); color:var(--txm); }
.fchip.act{ border-color:var(--pr); color:var(--pr); background:var(--prs); }
.date-lbl{ padding:7px 16px; font-size:10px; font-weight:600; color:var(--txd); text-transform:uppercase; letter-spacing:.6px; background:var(--bg); position:sticky; top:0; z-index:1; border-bottom:1px solid var(--bd); }
.task-row{ display:flex; align-items:flex-start; gap:12px; padding:11px 16px; border-bottom:1px solid var(--bd); cursor:pointer; transition:background var(--tmi); }
.task-row:hover{ background:var(--hv); }
.task-thumb{ width:44px; height:44px; border-radius:var(--rmd); background:var(--s3); border:1px solid var(--bd); display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
.task-info{ flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
.task-prompt{ font-size:12px; line-height:16px; color:var(--tx); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.task-meta{ display:flex; align-items:center; gap:8px; }
.sec-lbl{ padding:12px 16px 8px; font-size:11px; font-weight:600; color:var(--txd); text-transform:uppercase; letter-spacing:.6px; }
.prov-row{ display:flex; align-items:center; gap:12px; padding:0 16px; height:64px; border-top:1px solid var(--bd); cursor:pointer; transition:background var(--tmi); }
.prov-row:hover{ background:var(--hv); }
.prov-ico{ width:36px; height:36px; border-radius:var(--rmd); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-family:var(--fM); font-size:12px; font-weight:500; }
.prov-info{ flex:1; min-width:0; }
.prov-name{ display:flex; align-items:center; gap:6px; font-size:13px; font-weight:500; color:var(--tx); flex-wrap:wrap; }
.prov-model{ font-family:var(--fM); font-size:10px; color:var(--txd); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.badge{ padding:1px 7px; border-radius:var(--rfl); font-size:10px; font-weight:500; flex-shrink:0; }
.badge.active{ background:var(--oks); color:var(--ok); }
.badge.connected{ background:var(--scs); color:var(--sc); }
.badge.error{ background:var(--ers); color:var(--er); }
.badge.none{ background:var(--hv); color:var(--txd); }
.completeness{ display:flex; gap:2px; }
.cdot{ width:5px; height:5px; border-radius:50%; background:var(--bd); }
.cdot.f{ background:var(--pr); } .cdot.w{ background:var(--wa); } .cdot.e{ background:var(--er); }
.footer-info{ padding:12px 16px; border-top:1px solid var(--bd); display:flex; align-items:center; gap:8px; }
.section{ padding:16px; }
.section+.section{ border-top:1px solid var(--bd); }
.section-title{ font-size:11px; font-weight:600; color:var(--txd); text-transform:uppercase; letter-spacing:.6px; margin-bottom:12px; }
.field{ margin-bottom:12px; }
.field:last-child{ margin-bottom:0; }
.field-label{ font-size:12px; font-weight:500; color:var(--txm); margin-bottom:4px; display:block; }
.field-input{ width:100%; background:var(--s2); border:1px solid var(--bd); border-radius:var(--rmd); padding:9px 12px; color:var(--tx); font-family:var(--fB); font-size:13px; outline:none; transition:border-color var(--tmi); }
.field-input:focus{ border-color:var(--bd2); }
.field-input::placeholder{ color:var(--txd); }
.field-input.mono{ font-family:var(--fM); font-size:12px; letter-spacing:.5px; }
.field-hint{ font-size:11px; color:var(--txd); margin-top:4px; }
.pw-wrap{ position:relative; }
.pw-wrap .field-input{ padding-right:40px; }
.pw-toggle{ position:absolute; right:10px; top:50%; transform:translateY(-50%); background:transparent; border:none; color:var(--txd); cursor:pointer; display:flex; align-items:center; transition:color var(--tmi); }
.pw-toggle:hover{ color:var(--txm); }
.chips{ display:flex; flex-wrap:wrap; gap:8px; }
.chip{ padding:5px 12px; border-radius:var(--rfl); border:1px solid var(--bd); background:transparent; color:var(--txm); font-family:var(--fM); font-size:11px; cursor:pointer; transition:all var(--tmi) var(--eo); }
.chip:hover{ border-color:var(--bd2); color:var(--tx); }
.chip.act{ border-color:var(--pr); color:var(--pr); background:var(--prs); }
.param-val{ font-family:var(--fM); font-size:12px; color:var(--tx); background:var(--s2); border:1px solid var(--bd); border-radius:var(--rsm); padding:5px 10px; min-width:36px; text-align:center; cursor:pointer; transition:all var(--tmi); }
.param-val.act{ border-color:var(--pr); color:var(--pr); background:var(--prs); }
.aspect-grid{ display:flex; gap:8px; }
.aspect-opt{ flex:1; padding:8px 4px; border-radius:var(--rmd); border:1px solid var(--bd); background:transparent; display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; transition:all var(--tmi) var(--eo); }
.aspect-opt:hover{ border-color:var(--bd2); background:var(--hv); }
.aspect-opt.act{ border-color:var(--pr); background:var(--prs); }
.aspect-ico{ background:var(--txd); border-radius:2px; transition:background var(--tmi); }
.aspect-opt.act .aspect-ico{ background:var(--pr); }
.aspect-lbl{ font-family:var(--fM); font-size:10px; color:var(--txd); }
.aspect-opt.act .aspect-lbl{ color:var(--pr); }
.slider-wrap{ display:flex; align-items:center; gap:12px; }
.slider{ -webkit-appearance:none; flex:1; height:3px; border-radius:2px; background:var(--s3); outline:none; cursor:pointer; }
.slider::-webkit-slider-thumb{ -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:var(--pr); cursor:pointer; transition:transform var(--tmi); }
.slider::-webkit-slider-thumb:hover{ transform:scale(1.2); }
.slider-val{ font-family:var(--fM); font-size:12px; color:var(--tx); min-width:30px; text-align:right; }
.adv-toggle{ display:flex; align-items:center; gap:8px; padding:12px 16px; border-top:1px solid var(--bd); cursor:pointer; background:transparent; border-left:none; border-right:none; border-bottom:none; width:100%; text-align:left; transition:background var(--tmi); color:var(--txm); font-family:var(--fB); font-size:12px; font-weight:500; }
.adv-toggle:hover{ background:var(--hv); }
.adv-chev{ margin-left:auto; color:var(--txd); transition:transform var(--tsh); }
.adv-chev.open{ transform:rotate(180deg); }
.adv-body{ overflow:hidden; transition:max-height 200ms var(--eo); }
.test-area{ padding:16px; border-top:1px solid var(--bd); display:flex; flex-direction:column; gap:10px; }
.test-btn{ width:100%; padding:9px; border-radius:var(--rmd); border:1px solid var(--bd2); background:transparent; color:var(--txm); font-family:var(--fB); font-size:13px; font-weight:500; cursor:pointer; transition:all var(--tmi) var(--eo); display:flex; align-items:center; justify-content:center; gap:8px; }
.test-btn:hover{ border-color:var(--sc); color:var(--sc); background:var(--scs); }
.test-btn:disabled{ opacity:.5; cursor:not-allowed; }
.test-result{ display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:var(--rsm); font-size:12px; font-weight:500; }
.test-result.ok{ background:var(--oks); color:var(--ok); }
.det-footer{ flex-shrink:0; padding:12px 16px; border-top:1px solid var(--bd); display:flex; gap:8px; background:var(--bg); }
.btn-save{ flex:1; padding:10px; border-radius:var(--rmd); border:none; background:var(--pr); color:var(--txi); font-family:var(--fB); font-size:13px; font-weight:600; cursor:pointer; transition:all var(--tmi) var(--eo); }
.btn-save:hover{ background:var(--prh); }
.btn-del{ padding:10px 14px; border-radius:var(--rmd); border:1px solid var(--ers); background:transparent; color:var(--er); font-family:var(--fB); font-size:13px; cursor:pointer; transition:all var(--tmi); }
.btn-del:hover{ background:var(--ers); }
`;

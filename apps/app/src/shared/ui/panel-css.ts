export const PANEL_CSS = `

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
  --fD:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; --fB:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; --fM:'SF Mono','Menlo',monospace;
  --eo:cubic-bezier(.2,0,0,1); --tmi:80ms; --tsh:160ms;
}
*,*::before,*::after{box-sizing:border-box;}
button,input,textarea,select{
  -webkit-appearance:none; appearance:none;
  font-family:inherit; font-size:inherit; font-weight:inherit; line-height:inherit;
  color:inherit; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; padding:0;
}
button{ border:0; background:transparent; }
html,body{
  width:100%; height:100%; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; padding:0; background:#060A0F;
  font-family:var(--fB); -webkit-font-smoothing:antialiased;
}
#root{ width:100%; height:100%; }

/* === Spectrum theme + customization layer ===
 * sp-theme 以 display:contents 透明参与布局，同时把 Spectrum token 下发给所有 SWC 子组件。
 * 项目品牌强调色映射到 Spectrum accent（公开 token），并覆盖 accent 内容色为深色，
 * 保证浅色 mint 绿底上文字可读。组件级 sizing 集中在此，不在页面散落 --spectrum-* 覆盖。
 */
sp-theme.app-theme{
  display:contents;
  --spectrum-accent-background-color-default:var(--pr);
  --spectrum-accent-background-color-hover:var(--prh);
  --spectrum-accent-background-color-down:var(--pra);
  --spectrum-accent-background-color-key-focus:var(--prh);
  --spectrum-accent-color-400:var(--pr);
  --spectrum-accent-color-500:var(--prh);
  --spectrum-accent-color-900:var(--pra);
  --spectrum-accent-visual-color:var(--pr);
  --spectrum-accent-content-color-default:var(--txi);
  --spectrum-accent-content-color-hover:var(--txi);
  --spectrum-accent-content-color-down:var(--txi);
  --spectrum-accent-content-color-focus:var(--txi);
  --spectrum-background-base-color:var(--bg);
  --spectrum-neutral-background-color-default:var(--s2);
}
/* SWC 控件在暗色面板里的基础底色对齐 */
sp-action-button,.swc-field sp-textfield,sp-textfield{ --spectrum-textfield-background-color:var(--s2); }
/* 选中态统一到品牌 accent 绿（默认 Spectrum selected 是中性灰），用于 filter / model chip /
 * composer add / copy 等受控 ActionButton，使 "选中即绿" 与 primary 按钮同一套设计语言。 */
sp-action-button[selected]{
  --mod-actionbutton-background-color-default-selected:var(--pr);
  --mod-actionbutton-background-color-hover-selected:var(--prh);
  --mod-actionbutton-background-color-down-selected:var(--pra);
  --mod-actionbutton-background-color-focus-selected:var(--prh);
  --mod-actionbutton-content-color-default-selected:var(--txi);
  --mod-actionbutton-content-color-hover-selected:var(--txi);
  --mod-actionbutton-content-color-down-selected:var(--txi);
  --mod-actionbutton-content-color-focus-selected:var(--txi);
}
.swc-field{ display:flex; width:100%; --spectrum-textfield-width:100%; --mod-textfield-width:100%; --spectrum-textfield-background-color:var(--s2); --spectrum-textfield-border-color:var(--bd); }
.swc-field sp-textfield,.field-input.mono{ font-family:var(--fM); }
.swc-button{ width:100%; display:flex; align-items:center; justify-content:center; }

.panel{
  width:100%; height:100%; background:var(--bg); color:var(--tx);
  font-size:14px; line-height:20px; overflow:hidden;
  display:flex; flex-direction:column; position:relative;
  border-radius:4px;
}

/* Pages */
.page{ position:absolute; top:0; right:0; bottom:0; left:0; display:flex; flex-direction:column; background:var(--bg); }

/* Header */
.hdr{
  height:48px; background:var(--s1); border-bottom:1px solid var(--bd);
  display:flex; align-items:center; padding:0 12px; flex-shrink:0; z-index:10;
}
.hdr-btn{
  display:inline-flex; align-items:center; justify-content:center;
  color:var(--txm); flex-shrink:0;
}
.hdr-center{
  flex:1; min-width:0; display:flex; flex-direction:column; align-items:center;
  margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; padding:0; border:none; background:transparent; color:inherit; cursor:pointer; outline:none;
  overflow:hidden;
}
.hdr-center > span:first-child{ max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hdr-provider{ font-family:var(--fM); font-size:10px; color:var(--txd); letter-spacing:.4px; }
.hdr-title{ flex:1; min-width:0; margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; font-family:var(--fD); font-size:14px; font-weight:600; color:var(--tx); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Scroll */
.scroll{ overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--bd) transparent; flex:1; min-height:0; }
.scroll::-webkit-scrollbar{ width:3px; }
.scroll::-webkit-scrollbar-thumb{ background:var(--bd); border-radius:2px; }
.round-list{ padding:12px 12px 4px; display:flex; flex-direction:column; min-height:100%; }

/* Day separator */
.day-sep{ display:flex; align-items:center; padding:8px 0; }
.day-sep-line{ flex:1; height:1px; background:var(--bd); }
.day-sep-lbl{ margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; font-family:var(--fM); font-size:10px; color:var(--txd); padding:0 4px; }

/* USER bubble (right) */
.msg-user{ display:flex; justify-content:flex-end; padding:3px 0; }
.user-wrap{ max-width:82%; display:flex; flex-direction:column; align-items:flex-end; }.user-meta{ margin-top:3px; }
.user-bubble{ background:var(--s3); border-radius:14px 14px 3px 14px; padding:9px 13px; }
.bubble-imgs{ display:flex; margin-bottom:6px; }
.bimg{
  position:relative; width:52px; height:52px; margin-right:4px; border-radius:8px;
  overflow:hidden; border:1px solid var(--bd); flex-shrink:0;
}
.bimg-bg{ width:100%; height:100%; object-fit:cover; }
.bimg-count{
  position:absolute; top:0; right:0; bottom:0; left:0; background:rgba(0,0,0,.6);
  display:flex; align-items:center; justify-content:center;
  font-family:var(--fM); font-size:12px; font-weight:600; color:#fff;
}
.user-prompt{
  font-size:13px; line-height:18px; color:var(--tx);
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  text-wrap:pretty;
}
.user-meta{ display:flex; align-items:center; padding-right:2px; }
.msg-time{ font-family:var(--fM); font-size:10px; color:var(--txd); }
.copy-btn{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:6px; color:var(--txd); flex-shrink:0;
}

/* PROVIDER bubble (left) */
.msg-prov{ display:flex; align-items:flex-start; padding:3px 0; }
.av-prov{
  width:28px; height:28px; border-radius:50%; flex-shrink:0; margin-top:1px;
  background:rgba(103,183,255,.12);
  display:flex; align-items:center; justify-content:center;
  font-family:var(--fM); font-size:11px; font-weight:600; color:var(--sc);
  border:none; cursor:pointer;
}
.av-prov:disabled{ cursor:default; opacity:.7; }
.av-prov.err{ background:var(--ers); color:var(--er); cursor:default; }
.prov-card{
  flex:1; min-width:0; margin-left:8px; max-width:calc(100% - 36px);
  background:var(--s1); border:1px solid var(--bd);
  border-radius:3px 14px 14px 14px; overflow:hidden;
}
.prov-top{ display:flex; align-items:center; justify-content:space-between; padding:7px 12px 5px; }
.prov-name-lbl{ font-family:var(--fM); font-size:10px; font-weight:500; color:var(--txd); letter-spacing:.3px; }
.prov-status{ display:flex; align-items:center; font-family:var(--fM); font-size:10px; font-weight:500; }
.sdot{ width:5px; height:5px; border-radius:50%; }
.prov-status .sdot{ margin-right:4px; }
.sdot.ok{ background:var(--ok); }
.sdot.run{ background:var(--wa); }
.sdot.err{ background:var(--er); }
.status-inline{ display:flex; align-items:center; }
.status-inline .sdot{ margin-right:6px; }
.status-inline.tight .sdot{ margin-right:4px; }
.status-inline.loose .sdot{ margin-right:8px; }

/* Image result */
.prov-img{ border-top:1px solid var(--bd); position:relative; overflow:hidden; background:var(--bg); }
.img-result{ width:100%; height:auto; min-height:120px; max-height:240px; position:relative; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.img-bg{ max-width:100%; max-height:240px; display:block; object-fit:contain; }
.img-overlay{
  position:absolute; top:0; right:0; bottom:0; left:0;
  background:rgba(7,10,15,.72);
  opacity:0;
  display:flex; align-items:flex-end; padding:8px;
}
.img-result:hover .img-overlay{ opacity:1; }
.img-meta{
  position:absolute; top:8px; right:8px;
  font-family:var(--fM); font-size:9px; color:rgba(255,255,255,.7);
  background:rgba(0,0,0,.5); padding:2px 6px; border-radius:4px;
  opacity:0; pointer-events:none;
}
.img-result:hover .img-meta{ opacity:1; }
.img-act{
  display:flex; align-items:center; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  padding:4px 10px; border-radius:var(--rfl); border:none;
  font-family:var(--fB); font-size:11px; font-weight:600; cursor:pointer;
}
.img-act [data-icon]{ margin-right:5px; }
.img-act.prim{ background:var(--pr); color:var(--txi); }
.img-act.prim:hover{ background:var(--prh); }
.img-act.sec{ background:rgba(255,255,255,.13); color:var(--tx); }
.img-act.sec:hover{ background:rgba(255,255,255,.22); }

/* Loading */
.prov-loading{ display:flex; align-items:center; padding:10px 12px; }
.ldots{ display:flex; margin-right:10px; }
.ldot{ width:5px; height:5px; margin-right:4px; border-radius:50%; background:var(--pr); }

/* Action row */
.prov-actions{ border-top:1px solid var(--bd); padding:1px 8px; display:flex; align-items:center; }
.act-ico{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:1px; margin-bottom:0; margin-left:0; color:var(--txd); flex-shrink:0;
}
.act-ico.prim{ color:var(--pr); }

/* Error */
.err-card{
  flex:1; min-width:0;
  margin-left:8px;
  background:rgba(242,109,109,.06); border:1px solid rgba(242,109,109,.2);
  border-radius:3px 14px 14px 14px; padding:10px 12px;
  display:flex; flex-direction:column;
}
.err-top{ display:flex; align-items:center; }
.err-top .sdot{ margin-right:5px; }
.err-msg{ margin-top:5px; font-size:12px; color:var(--txm); line-height:16px; padding-left:14px; }
.err-actions{ display:flex; align-items:center; align-self:flex-start; margin-top:5px; margin-left:14px; }
.err-retry{
  padding:3px 10px; border-radius:var(--rsm);
  border:1px solid rgba(242,109,109,.35); background:transparent;
  color:var(--er); font-size:11px; font-weight:500; cursor:pointer; font-family:var(--fB);
}
.err-retry:hover{ background:var(--ers); }
.err-retry:disabled{ opacity:.45; cursor:not-allowed; }
.err-copy{
  padding:3px 10px; border-radius:var(--rsm);
  border:1px solid var(--bd); background:transparent;
  color:var(--txm); font-size:11px; font-weight:500; cursor:pointer; font-family:var(--fB);
  margin-left:8px;
}
.err-copy:hover{ background:var(--hv); color:var(--tx); }
.err-copy:disabled{ opacity:.45; cursor:not-allowed; }
.row-retry{
  margin-left:auto; padding:2px 8px; border-radius:var(--rsm); border:1px solid var(--ers);
  background:transparent; color:var(--er); font-size:10px; font-weight:500; cursor:pointer; font-family:var(--fB);
}
.row-retry:hover{ background:var(--ers); }

/* Empty */
.conv-empty{
  flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:24px; text-align:center;
}
.empty-hints{ display:flex; flex-direction:column; width:100%; max-width:270px; margin-top:14px; }
.empty-hint{
  margin-top:0; margin-right:0; margin-bottom:5px; margin-left:0;
  background:var(--s2); border:1px solid var(--bd); border-radius:var(--rmd);
  padding:7px 12px; font-size:12px; color:var(--txm); text-align:left; cursor:pointer; font-family:var(--fB); line-height:16px;
}
.empty-hint:hover{ border-color:var(--bd2); color:var(--tx); background:var(--s3); }

/* Composer */
.composer{
  flex-shrink:0; padding:8px 12px 12px; background:var(--bg);
  border-top:1px solid var(--bd); position:relative;
}

/* Attachment row */
.attach-row{
  display:flex; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; flex-wrap:nowrap;
}
.attach-row::-webkit-scrollbar{ display:none; }
.att-thumb{
  position:relative; width:52px; height:52px; margin-right:6px; border-radius:8px;
  overflow:hidden; border:1px solid var(--bd); flex-shrink:0;
}
.att-rm{
  position:absolute; top:2px; right:2px; width:16px; height:16px; border-radius:50%;
  background:rgba(0,0,0,.75); color:white; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; font-size:11px; line-height:1;
}
.att-rm:hover{ background:var(--er); }

/* Model menu */
.model-menu{
  position:absolute; bottom:calc(100% + 4px); left:84px;
  background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rmd);
  overflow:hidden; min-width:210px; max-width:calc(100% - 96px); z-index:200;
}
.model-opt{
  padding:8px 12px; font-family:var(--fM); font-size:12px; color:var(--txm);
  cursor:pointer; display:flex; align-items:center;
}
.model-opt [data-icon]{ margin-right:8px; }
.model-opt:hover{ background:var(--hv); color:var(--tx); }
.model-opt.act{ color:var(--pr); }

/* Attach picker */
.attach-picker{
  position:absolute; bottom:calc(100% + 4px); left:12px;
  background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rmd);
  overflow:hidden; width:196px; max-width:calc(100% - 24px); z-index:200;
}
.attach-opt{
  display:flex; align-items:center; padding:10px 14px;
  cursor:pointer; border-bottom:1px solid var(--bd);
}
.attach-opt:last-child{ border-bottom:none; }
.attach-opt:hover{ background:var(--hv); }
.attach-opt-ico{ width:28px; height:28px; margin-right:10px; border-radius:var(--rsm); background:var(--s2); display:flex; align-items:center; justify-content:center; color:var(--txm); flex-shrink:0; }
.attach-opt-label{ font-size:12px; font-weight:500; color:var(--tx); }
.attach-opt-sub{ font-size:10px; color:var(--txd); font-family:var(--fM); margin-top:1px; }

/* Layer list */
.layer-list-wrap{
  position:absolute; bottom:calc(100% + 4px); left:12px;
  background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rmd);
  overflow:hidden; width:230px; max-width:calc(100% - 24px); z-index:201;
}
.layer-list-hdr{
  padding:7px 12px; font-size:10px; font-weight:600; color:var(--txd);
  text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid var(--bd);
  display:flex; align-items:center;
}
.layer-back{ margin-top:0; margin-right:8px; margin-bottom:0; margin-left:0; background:transparent; border:none; color:var(--txd); cursor:pointer; display:flex; align-items:center; }
.layer-refresh{ margin-left:auto; background:transparent; border:none; color:var(--txd); cursor:pointer; display:flex; align-items:center; }
.layer-scroll{ max-height:240px; max-height:calc(100vh - 200px); overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--bd) transparent; }
.layer-scroll::-webkit-scrollbar{ width:3px; }
.layer-item{
  display:flex; align-items:center; padding:5px 12px;
  cursor:pointer; border-bottom:1px solid rgba(46,55,72,.5);
}
.layer-item:last-child{ border-bottom:none; }
.layer-item:hover{ background:var(--hv); }
.layer-swatch{ width:24px; height:24px; margin-right:8px; border-radius:4px; flex-shrink:0; border:1px solid var(--bd); }
.layer-name{ font-size:12px; color:var(--tx); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.layer-meta-lbl{ font-family:var(--fM); font-size:9px; color:var(--txd); white-space:nowrap; }

/* Composer */
.cmp-shell{
  width:100%;
  display:flex;
  flex-direction:column;
 
}
.cmp-shell.off{ opacity:.38; pointer-events:none; }
.cmp-attach-band{ display:flex; flex-direction:column; }
.cmp-core{
  width:100%; background:var(--s2); border:1px solid var(--bd); border-radius:var(--rxl);
  padding:9px 10px 8px; display:flex; flex-direction:column;
}
.cmp-core:focus-within{ border-color:var(--bd2); }
.cmp-body{ display:flex; flex-direction:column; }
.cmp-action-row,
.cmp-toolbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  flex-wrap:nowrap;
  min-width:0;
 
}
.cmp-action-row{ margin-top:8px; }
.cmp-toolbar{ padding:0 2px; }
.cmp-action-left,
.cmp-toolbar-left{
  display:flex;
  align-items:center;
  min-width:0;
  flex:1 1 auto;
  overflow:hidden;
 
}
.cmp-action-right,
.cmp-toolbar-right{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  min-width:0;
  flex:0 0 auto;
 
}
.cmp-select{ position:relative; display:flex; align-items:center; min-width:0; flex-shrink:1; }
.cmp-select-model{ flex:1 1 108px; min-width:108px; }
.cmp-select-target{ flex:0 1 74px; min-width:0; }
.cmp-select-aspect{ flex:0 1 64px; min-width:0; }
.cmp-select-menu{
  position:absolute; left:0; bottom:calc(100% + 4px); z-index:200;
  min-width:120px; max-width:calc(100% - 0px); background:var(--s3); border:1px solid var(--bd2); border-radius:var(--rmd);
  overflow:hidden;
}
.cmp-select-menu-model{ min-width:180px; max-width:calc(100% - 0px); }
.cmp-select-menu-compact{ min-width:96px; }
.cmp-ta{
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  display:block; appearance:none; -webkit-appearance:none;
  background:transparent; background-color:transparent; border:none; outline:none;
  color:var(--tx); font-family:var(--fB); font-size:13px; line-height:18px;
  resize:none; min-height:34px; max-height:72px; overflow-y:auto; padding:0;
  scrollbar-width:thin; width:100%;
}
.cmp-ta::placeholder{ color:var(--txd); }

/* + attach button */
.cmp-add{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; color:var(--txm); flex-shrink:0;
}

/* Model chip (native dropdown trigger) */
.cmp-chip{
  display:flex; align-items:center; min-width:0; max-width:100%;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  padding:2px 7px; border-radius:var(--rfl);
  border:1px solid var(--bd); background:var(--s1);
  font-family:var(--fM); font-size:10px; line-height:14px; color:var(--txm);
  cursor:pointer; white-space:nowrap; user-select:none; min-width:0; max-width:100%; flex-shrink:1;
}
.cmp-chip:hover{ border-color:var(--bd2); color:var(--tx); }
.cmp-chip.open{ border-color:var(--pr); color:var(--pr); }
.cmp-chip.dis{ opacity:.45; cursor:not-allowed; }
.cmp-dot{ width:5px; height:5px; margin-right:4px; border-radius:50%; background:var(--pr); }
.cmp-chip-body{
  display:flex;
  align-items:center;
  min-width:0;
  flex:1 1 auto;
 
  overflow:hidden;
}
.cmp-chip-leading{ flex-shrink:0; }
.cmp-chip-value{
  display:block;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  flex:1 1 auto;
}
.cmp-chip-arrow{
  display:flex;
  align-items:center;
  justify-content:center;
  width:18px;
  height:18px;
  margin-left:4px;
  flex:0 0 auto;
  border-radius:50%;
  background:var(--s2);
  color:var(--txm);
}
.cmp-chip-chevron{ flex-shrink:0; }
.cmp-select-model .cmp-chip{ width:100%; min-width:0; }
.cmp-sp{ flex:1; min-width:0; }
.cmp-opt{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; color:var(--txm); flex-shrink:0;
}

/* Send button (native, e2e checks HTMLButtonElement) */
.send-wrap{ display:flex; align-items:stretch; border-radius:50%; overflow:hidden; flex-shrink:0; }
.cmp-send{
  width:32px; height:32px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; border:none;
  border-radius:50%;
  background:var(--pr); color:var(--txi); cursor:pointer;
  display:flex; align-items:center; justify-content:center;
}
.cmp-send:hover{ background:var(--prh); }
.cmp-send:active{ background:var(--pra); }
.cmp-send:disabled{ opacity:.35; cursor:not-allowed; }

@media (max-width:360px){
  .cmp-core{ padding:8px; }
  .cmp-action-row{ margin-top:6px; }
  .cmp-action-row,
  .cmp-toolbar{ }
  .cmp-add,
  .cmp-opt{ width:28px; height:28px; }
  .cmp-send{ width:30px; height:30px; }
  .cmp-select-target{ flex-basis:92px; }
  .cmp-select-aspect{ flex-basis:84px; }
  .cmp-chip{ padding:2px 6px; font-size:9px; }
  .cmp-select-model{ min-width:100px; }
  .cmp-select-target .cmp-chip [data-icon-name="ps-layers"],
  .cmp-select-target .cmp-chip [data-icon-name="selection"],
  .cmp-select-aspect .cmp-chip [data-icon-name="image-auto-mode"]{ display:none !important; }
}

@media (max-width:320px){
  .cmp-toolbar{ }
  .cmp-select-model{ min-width:92px; }
  .cmp-select-target{ flex-basis:66px; }
  .cmp-select-aspect{ flex-basis:58px; }
  .cmp-chip{ padding:2px 5px; }
  .cmp-select-target .cmp-chip-value,
  .cmp-select-aspect .cmp-chip-value{ max-width:56px; }
}

/* Compare Lightbox */
.lightbox{
  position:fixed; top:0; right:0; bottom:0; left:0; background:rgba(0,0,0,.92); z-index:1000;
  display:flex; align-items:center; justify-content:center;
}
.lb-inner{ position:relative; display:flex; flex-direction:column; align-items:center; }
.lb-actions{ margin-top:12px; display:flex; }
.lb-close{
  position:absolute; top:-42px; right:0;
  background:transparent; border:none; color:rgba(255,255,255,.4);
  cursor:pointer; font-size:26px; line-height:1;
}
.lb-close:hover{ color:#fff; }
.compare-wrap{
  position:relative; width:500px; height:500px; max-width:calc(100vw - 48px); max-height:calc(100vh - 48px); border-radius:var(--rmd);
  overflow:hidden; user-select:none; border:1px solid var(--bd);
}
.cmp-layer{ position:absolute; top:0; right:0; bottom:0; left:0; }
.cmp-divider{
  position:absolute; top:0; bottom:0; width:2px;
  background:rgba(255,255,255,.9);
  pointer-events:none;
}
.cmp-handle{
  position:absolute; top:50%; left:50%;
  width:36px; height:36px; border-radius:50%; background:white;
  display:flex; align-items:center; justify-content:center;
}
.cmp-lbl{
  position:absolute; top:10px;
  background:rgba(0,0,0,.55); padding:2px 8px; border-radius:4px;
  font-family:var(--fM); font-size:10px; color:white; letter-spacing:.3px;
}
.lb-btn{
  margin-top:0; margin-right:8px; margin-bottom:0; margin-left:0; padding:8px 20px; border-radius:var(--rsm); border:none;
  font-family:var(--fB); font-size:12px; font-weight:600; cursor:pointer;
  display:flex; align-items:center;
}
.lb-btn [data-icon]{ margin-right:6px; }
.lb-btn.prim{ background:var(--pr); color:var(--txi); }
.lb-btn.prim:hover{ background:var(--prh); }
.lb-btn.sec{ background:var(--s3); color:var(--txm); }
.lb-btn.sec:hover{ background:var(--bd2); color:var(--tx); }

/* Toast (sp-toast host positioning) */
sp-toast[data-testid="toast"]{
  position:absolute; top:12px; right:12px; left:auto; bottom:auto; z-index:2000;
  max-width:calc(100% - 48px); max-height:calc(100% - 48px); overflow-y:auto; pointer-events:auto;
}

/* History / Settings shared */
.filter-bar{ display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid var(--bd); background:var(--s1); flex-shrink:0; overflow-x:auto; scrollbar-width:none; }
.filter-bar::-webkit-scrollbar{ display:none; }
.fchip{ margin-right:6px; flex-shrink:0; }
.task-row{ display:flex; align-items:flex-start; padding:11px 16px; border-bottom:1px solid var(--bd); cursor:pointer; }
.task-row:hover{ background:var(--hv); }
.task-thumb{ width:44px; height:44px; margin-right:12px; border-radius:var(--rmd); background:var(--s3); border:1px solid var(--bd); display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
.task-info{ flex:1; min-width:0; display:flex; flex-direction:column; }
.task-prompt{ font-size:12px; line-height:16px; color:var(--tx); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.task-meta{ display:flex; align-items:center; margin-top:3px; }
.task-meta-dot{ margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; color:var(--bd2); }
.sec-lbl{ padding:12px 16px 8px; font-size:11px; font-weight:600; color:var(--txd); text-transform:uppercase; letter-spacing:.6px; }
.prov-row{ display:flex; align-items:center; padding:0 16px; height:64px; border-top:1px solid var(--bd); cursor:pointer; }
.prov-row:hover{ background:var(--hv); }
.prov-ico{ width:36px; height:36px; margin-right:12px; border-radius:var(--rmd); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-family:var(--fM); font-size:12px; font-weight:500; }
.prov-info{ flex:1; min-width:0; overflow:hidden; }
.prov-name{ display:flex; align-items:center; font-size:13px; font-weight:500; color:var(--tx); flex-wrap:wrap; min-width:0; }
.prov-name > span:first-child{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.prov-model{ font-family:var(--fM); font-size:10px; color:var(--txd); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.prov-family{ margin-left:6px; flex-shrink:0; }
.badge{ margin-left:6px; padding:1px 7px; border-radius:var(--rfl); font-size:10px; font-weight:500; flex-shrink:0; }
.badge.active{ background:var(--oks); color:var(--ok); }
.badge.connected{ background:var(--scs); color:var(--sc); }
.badge.error{ background:var(--ers); color:var(--er); }
.badge.none{ background:var(--hv); color:var(--txd); }
.completeness{ display:flex; }
.cdot{ width:5px; height:5px; margin-right:2px; border-radius:50%; background:var(--bd); }
.cdot.f{ background:var(--pr); } .cdot.w{ background:var(--wa); } .cdot.e{ background:var(--er); }
.footer-info{ padding:12px 16px; border-top:1px solid var(--bd); display:flex; align-items:center; }
.footer-info [data-icon]{ margin-right:8px; }
.section{ padding:16px; }
sp-divider{ --spectrum-divider-background-color:var(--bd); }
.section-title{ font-size:11px; font-weight:600; color:var(--txd); text-transform:uppercase; letter-spacing:.6px; margin-bottom:12px; }
.field{ margin-bottom:12px; }
.field:last-child{ margin-bottom:0; }
.field-input{ width:100%; }
.field-hint{ margin-top:4px; }
.pw-wrap{ display:flex; align-items:center; }
.pw-wrap .field-input{ flex:1; }
.pw-toggle{ margin-left:6px; color:var(--txd); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
.chips{ display:flex; flex-wrap:wrap; align-items:center; }
.chip{ margin-right:8px; margin-bottom:8px; flex-shrink:0; }
.test-area{ padding:16px; border-top:1px solid var(--bd); display:flex; flex-direction:column; }
.test-area .swc-button{ width:100%; }
.test-area .status-notice{ margin-top:10px; }
.scroll-footer-pad{ padding-bottom:80px; }
.det-footer{ flex-shrink:0; padding:12px 16px; border-top:1px solid var(--bd); display:flex; background:var(--bg); }
.btn-save{ flex:1; }
.btn-del{ margin-left:8px; }
.btn-cancel{ margin-left:8px; }
@media (max-height:440px){
  .settings-page .section{ padding:12px; }
  .settings-page .field{ margin-bottom:10px; }
  .settings-page .test-area{ padding:12px; }
  .settings-page .det-footer{ padding:8px 12px; }
  .settings-page .scroll-footer-pad{ padding-bottom:96px; }
  .settings-page .chip{ margin-right:6px; margin-bottom:6px; }
}
.status-notice{
  display:flex; align-items:flex-start;
  padding:8px 10px; border-radius:var(--rsm); border:1px solid var(--bd);
  background:var(--s2); color:var(--txm);
}
.status-notice.success{ border-color:var(--oks); background:var(--oks); color:var(--ok); }
.status-notice.warning{ border-color:var(--was); background:var(--was); color:var(--wa); }
.status-notice.error{ border-color:var(--ers); background:var(--ers); color:var(--er); }
.status-message{
  flex:1;
  min-width:0; white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere;
  font-family:var(--fM); font-size:11px; line-height:16px; user-select:text; -webkit-user-select:text;
}
.status-copy{
  flex-shrink:0; margin-left:8px;
  width:28px; height:28px; border-radius:var(--rsm); color:currentColor; cursor:pointer;
  display:flex; align-items:center; justify-content:center; opacity:.8;
  background:transparent; border:none;
}
.status-copy:hover{ background:var(--hv); opacity:1; }
.status-copy.cp{ color:var(--ok); }

/* Back to bottom */
.back-to-bottom{
  position:absolute; right:12px; bottom:calc(100% + 12px);
  width:32px; height:32px; border-radius:50%;
  background:var(--s2); border:1px solid var(--bd);
  color:var(--txm); cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  z-index:100;
}
.back-to-bottom:hover{ background:var(--s3); color:var(--tx); }

/* Round highlight flash (static class, no animations) */
.round-flash{ background:var(--scs) !important; }
.round-flash .user-bubble{ background:rgba(103,183,255,.2) !important; }
.round-flash .prov-card{ border-color:var(--sc) !important; }

/* Narrow panel guards */
.cmp-bottom{ min-width:0; }
.cmp-select-target .cmp-chip-value{ max-width:48px; }
.cmp-select-aspect .cmp-chip-value{ max-width:56px; }
.hdr-provider{ max-width:100%; overflow:hidden; text-overflow:ellipsis; }
`;

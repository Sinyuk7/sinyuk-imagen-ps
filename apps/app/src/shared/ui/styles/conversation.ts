/** 会话区：user / provider 气泡、结果图、loading、error、empty 状态。 */
export const CONVERSATION_CSS = `
/* Day separator */
.day-sep{ display:flex; align-items:center; padding:8px 0; }
.day-sep-line{ flex:1; height:1px; background:var(--app-color-border-default); }
.day-sep-lbl{ margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; font-family:var(--app-font-family-mono); font-size:10px; color:var(--app-color-text-muted); padding:0 4px; }
.round-item{
  padding-top:0; padding-right:0; padding-bottom:12px; padding-left:0;
  margin-top:0; margin-right:0; margin-bottom:12px; margin-left:0;
  border-bottom:1px solid var(--app-color-border-default);
}
.round-item:last-child{ margin-bottom:0; border-bottom:none; }

/* USER bubble (right) */
.msg-user{ display:flex; justify-content:flex-end; padding:3px 0; }
.user-wrap{ max-width:min(82%, 68ch); display:flex; flex-direction:column; align-items:flex-end; }
.user-bubble{ max-width:100%; background:var(--app-color-background-elevated); border-radius:14px 14px 3px 14px; padding:9px 13px; }
.bubble-imgs{ display:flex; margin-bottom:6px; }
.bimg{
  position:relative; width:52px; height:52px; margin-right:4px; border-radius:8px;
  overflow:hidden; border:1px solid var(--app-color-border-default); flex-shrink:0;
}
.bimg-bg{ width:100%; height:100%; object-fit:cover; }
.bimg-count{
  position:absolute; top:0; right:0; bottom:0; left:0; background:rgba(0,0,0,.6);
  display:flex; align-items:center; justify-content:center;
  font-family:var(--app-font-family-mono); font-size:12px; font-weight:600; color:#fff;
}
.user-prompt{
  font-size:13px; line-height:18px; color:var(--app-color-text-primary);
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  text-wrap:pretty;
}
.user-meta{ display:flex; align-items:center; padding-right:2px; margin-top:3px; }
.msg-time{ font-family:var(--app-font-family-mono); font-size:10px; color:var(--app-color-text-muted); }
.copy-btn{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:6px; color:var(--app-color-text-muted); flex-shrink:0;
}
.copy-btn.cp{ color:var(--app-color-positive); }

/* PROVIDER bubble (left) */
.msg-prov{ display:flex; align-items:flex-start; min-width:0; padding:3px 0; }
.av-prov{
  width:28px; height:28px; border-radius:50%; flex-shrink:0; margin-top:1px;
  background:var(--app-color-informative-subtle);
  display:flex; align-items:center; justify-content:center;
  font-family:var(--app-font-family-mono); font-size:11px; font-weight:600; color:var(--app-color-informative);
  border:none; cursor:pointer;
}
.av-prov:disabled{ cursor:default; opacity:.7; }
.av-prov.err{ background:var(--app-color-negative-subtle); color:var(--app-color-negative); cursor:default; }
.prov-card{
  flex:1; min-width:0; margin-left:8px; max-width:calc(100% - 36px);
  background:var(--app-color-background-layer-1); border:1px solid var(--app-color-border-default);
  border-radius:3px 14px 14px 14px; overflow:hidden;
}
.prov-card-media{
  flex:0 1 auto;
  width:min(100% - 36px, 640px);
}
.prov-card-media.media-portrait{ width:min(100% - 36px, 520px); }
.prov-card-media.media-square{ width:min(100% - 36px, 620px); }
.prov-card-media.media-landscape{ width:min(100% - 36px, 820px); }
.prov-card-media.media-unknown{ width:min(100% - 36px, 640px); }
.prov-top{ display:flex; align-items:center; justify-content:space-between; min-width:0; padding:7px 12px 5px; }
.prov-name-lbl{ font-family:var(--app-font-family-mono); font-size:10px; font-weight:500; color:var(--app-color-text-muted); letter-spacing:.3px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.prov-status{ display:flex; align-items:center; min-width:0; font-family:var(--app-font-family-mono); font-size:10px; font-weight:500; }
.sdot{ width:5px; height:5px; border-radius:50%; }
.prov-status .sdot{ margin-right:4px; }
.sdot.ok{ background:var(--app-color-positive); }
.sdot.run{ background:var(--app-color-notice); }
.sdot.err{ background:var(--app-color-negative); }
.status-inline{ display:flex; align-items:center; }
.status-inline .sdot{ margin-right:6px; }
.status-inline.tight .sdot{ margin-right:4px; }
.status-inline.loose .sdot{ margin-right:8px; }

/* Image result */
.prov-img{ border-top:1px solid var(--app-color-border-default); position:relative; overflow:hidden; background:var(--app-color-background-base); }
.img-result{ width:100%; height:auto; min-height:120px; max-height:240px; position:relative; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.img-bg{ max-width:100%; max-height:240px; display:block; object-fit:contain; }
.prov-card-media.media-portrait .img-result{ min-height:220px; }
.prov-card-media.media-square .img-result{ min-height:220px; }
.prov-card-media.media-landscape .img-result{ min-height:160px; }
.img-overlay{
  position:absolute; top:0; right:0; bottom:0; left:0;
  background:rgba(7,10,15,.72);
  opacity:0;
  display:flex; align-items:flex-end; padding:8px;
}
.img-result:hover .img-overlay{ opacity:1; }
.img-meta{
  position:absolute; top:8px; right:8px;
  font-family:var(--app-font-family-mono); font-size:9px; color:rgba(255,255,255,.7);
  background:rgba(0,0,0,.5); padding:2px 6px; border-radius:4px;
  max-width:calc(100% - 16px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:0; pointer-events:none;
}
.img-result:hover .img-meta{ opacity:1; }
.img-act{
  display:flex; align-items:center; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  padding:4px 10px; border-radius:var(--app-radius-medium); border:none;
  font-family:var(--app-font-family-base); font-size:11px; font-weight:600; cursor:pointer;
}
.img-act > [data-icon]{ margin-right:5px; }
.img-act.prim{ background:var(--app-color-accent-default); color:var(--app-color-text-on-accent); }
.img-act.prim:hover{ background:var(--app-color-accent-hover); }
.img-act.sec{ background:var(--app-color-active-overlay); color:var(--app-color-text-primary); }
.img-act.sec:hover{ background:var(--app-color-hover-overlay); }

/* Loading */
.prov-loading{ display:flex; align-items:center; padding:10px 12px; }
.ldots{ display:flex; margin-right:10px; }
.ldot{ width:5px; height:5px; margin-right:4px; border-radius:50%; background:var(--app-color-accent-default); }

/* Action row */
.prov-actions{ border-top:1px solid var(--app-color-border-default); padding:1px 8px; display:flex; align-items:center; min-width:0; }
.act-ico{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:1px; margin-bottom:0; margin-left:0; color:var(--app-color-text-muted); flex-shrink:0;
}
.act-ico.prim{ color:var(--app-color-accent-default); }

/* Error */
.err-card{
  flex:1; min-width:0;
  margin-left:8px;
  background:var(--app-color-negative-subtle); border:1px solid var(--app-color-negative-subtle);
  border-radius:3px 14px 14px 14px; padding:10px 12px;
  display:flex; flex-direction:column;
}
.err-top{ display:flex; align-items:center; }
.err-top .sdot{ margin-right:5px; }
.err-msg{ margin-top:5px; font-size:12px; color:var(--app-color-text-secondary); line-height:16px; padding-left:14px; }
.err-actions{ display:flex; align-items:center; align-self:flex-start; min-width:0; margin-top:5px; margin-left:14px; }
.err-retry{
  padding:3px 10px; border-radius:var(--app-radius-small);
  border:1px solid var(--app-color-negative); background:transparent;
  color:var(--app-color-negative); font-size:11px; font-weight:500; cursor:pointer; font-family:var(--app-font-family-base);
}
.err-retry:hover{ background:var(--app-color-negative-subtle); }
.err-retry:disabled{ opacity:.45; cursor:not-allowed; }
.err-copy{
  padding:3px 10px; border-radius:var(--app-radius-small);
  border:1px solid var(--app-color-border-default); background:transparent;
  color:var(--app-color-text-secondary); font-size:11px; font-weight:500; cursor:pointer; font-family:var(--app-font-family-base);
  margin-left:8px;
}
.err-copy:hover{ background:var(--app-color-hover-overlay); color:var(--app-color-text-primary); }
.err-copy:disabled{ opacity:.45; cursor:not-allowed; }
.err-copy.cp{ color:var(--app-color-positive); }
.row-retry{
  margin-left:auto; padding:2px 8px; border-radius:var(--app-radius-small); border:1px solid var(--app-color-negative);
  background:transparent; color:var(--app-color-negative); font-size:10px; font-weight:500; cursor:pointer; font-family:var(--app-font-family-base);
}
.row-retry:hover{ background:var(--app-color-negative-subtle); }

/* Empty */
.conv-empty{
  flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:24px; text-align:center;
}
.empty-hints{ display:flex; flex-direction:column; width:100%; max-width:270px; margin-top:14px; }
.empty-hint{
  margin-top:0; margin-right:0; margin-bottom:5px; margin-left:0;
  background:var(--app-color-background-layer-2); border:1px solid var(--app-color-border-default); border-radius:var(--app-radius-medium);
  padding:7px 12px; font-size:12px; color:var(--app-color-text-secondary); text-align:left; cursor:pointer; font-family:var(--app-font-family-base); line-height:16px;
}
.empty-hint:hover{ border-color:var(--app-color-border-strong); color:var(--app-color-text-primary); background:var(--app-color-background-elevated); }

/* Round highlight flash (static class, no animations) */
.round-flash{ background:var(--app-color-informative-subtle) !important; }
.round-flash .user-bubble{ background:var(--app-color-informative-subtle) !important; }
.round-flash .prov-card{ border-color:var(--app-color-informative) !important; }
`;

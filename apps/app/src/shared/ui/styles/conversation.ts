/** 会话区：user / provider 气泡、结果图、loading、error、empty 状态。 */
export const CONVERSATION_CSS = `
/* Day separator */
.day-sep{ display:flex; align-items:center; padding:8px 0; }
.day-sep-line{ flex:1; height:1px; background:var(--app-color-border-default); }
.day-sep-lbl{ margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; font-family:var(--app-font-family-mono); font-size:10px; color:var(--app-color-text-muted); padding:0 4px; }
.round-item{
  position:relative;
  padding-top:0; padding-right:0; padding-bottom:20px; padding-left:0;
  margin-top:0; margin-right:0; margin-bottom:24px; margin-left:0;
  border-bottom:1px solid var(--app-color-border-default);
}
.motion-highlight{
  position:absolute; top:0; right:0; bottom:8px; left:0;
  border-radius:var(--app-radius-medium);
  background:var(--app-color-informative-subtle);
  opacity:0;
  pointer-events:none;
}
.motion-content{ min-width:0; }
.msg-prov-surface{ min-width:0; }
.round-item:last-child{ margin-bottom:0; border-bottom:none; }
.round-item-open{ padding-bottom:8px; margin-bottom:14px; border-bottom:none; }

/* USER bubble (right) */
.msg-user{ display:flex; justify-content:flex-end; padding:2px 0; }
.user-wrap{
  width:fit-content;
  max-width:var(--chat-prompt-max-width);
  display:flex;
  flex-direction:column;
  align-items:flex-end;
  margin-left:auto;
}
.user-bubble{ width:fit-content; max-width:100%; background:var(--app-color-background-elevated); border-radius:14px 14px 3px 14px; padding:9px 13px; }
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
  min-width:0;
}
.user-prompt-body{
  position:relative;
  max-height:54px;
  overflow:hidden;
}
.user-prompt[data-expanded="true"] .user-prompt-body{
  max-height:none;
  overflow:visible;
}
.user-prompt-text{
  font-size:13px; line-height:18px; color:var(--app-color-text-primary);
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  word-break:break-word;
  text-wrap:pretty;
}
.user-prompt-body::after{
  content:"";
  position:absolute;
  right:0;
  bottom:0;
  left:0;
  height:18px;
  pointer-events:none;
  background:linear-gradient(180deg, rgba(24,25,31,0), var(--app-color-background-elevated));
  opacity:0;
}
.user-prompt[data-expanded="true"] .user-prompt-body::after{
  display:none;
}
.user-prompt[data-overflowing="true"] .user-prompt-body::after{
  opacity:1;
}
.user-prompt-actions{ display:flex; align-items:center; min-width:0; margin-top:5px; }
.user-prompt-toggle{
  padding:2px 0;
  border:none;
  background:transparent;
  color:var(--app-color-text-muted);
  font-family:var(--app-font-family-base);
  font-size:11px;
  line-height:15px;
  cursor:pointer;
}
.user-prompt-toggle:hover{ color:var(--app-color-text-primary); }
.user-meta{ display:flex; align-items:center; padding-right:2px; margin-top:6px; }
.msg-time{ font-family:var(--app-font-family-mono); font-size:10px; color:var(--app-color-text-muted); }
.copy-btn{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:6px; color:var(--app-color-text-muted); flex-shrink:0;
  min-height:0; padding:0; border:none; background:transparent;
}
.copy-btn.cp{ color:var(--app-color-positive); }

/* PROVIDER bubble (left) */
.msg-prov{ display:flex; align-items:flex-start; min-width:0; padding-top:10px; padding-right:0; padding-bottom:0; padding-left:0; }
.prov-card{
  flex:0 1 auto; min-width:0; width:100%; max-width:var(--chat-result-max-width);
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  background:var(--app-color-background-layer-1); border:1px solid var(--app-color-border-default);
  border-radius:8px; overflow:hidden;
}
.prov-card-media{
  flex:0 1 auto;
  width:100%;
  max-width:var(--chat-result-max-width);
}
.prov-card-media.media-portrait,
.prov-card-media.media-square,
.prov-card-media.media-landscape,
.prov-card-media.media-wide,
.prov-card-media.media-unknown{ width:100%; max-width:var(--chat-result-max-width); }
.prov-card-text-only{ width:100%; max-width:var(--chat-result-max-width); }
.prov-top{ display:flex; align-items:flex-start; justify-content:flex-start; min-width:0; padding:8px 12px 7px; }
.prov-identity{
  display:flex; align-items:flex-start; min-width:0; width:auto; flex:1 1 auto;
  max-width:none;
  cursor:pointer;
}
.prov-identity[data-disabled="true"]{ cursor:default; }
.prov-identity-host{
  position:relative;
  width:18px; height:18px; min-width:18px; min-height:18px;
  margin-top:0; margin-right:7px; margin-bottom:0; margin-left:0;
  pointer-events:none;
  flex:0 0 auto;
}
.prov-identity-overlay{ align-items:center; justify-content:center; }
.prov-identity-icon-shell{
  width:18px; height:18px; min-width:18px; border-radius:50%;
  background:var(--app-color-accent-default); color:var(--app-color-text-on-accent);
  display:flex; align-items:center; justify-content:center;
}
.prov-identity-icon-slot{
  display:inline-flex;
  width:18px; height:18px; min-width:18px; min-height:18px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  flex:0 0 auto;
}
.prov-identity-icon-svg{
  display:block; width:16px; height:16px;
  color:inherit;
}
.prov-identity-icon-text{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:16px;
  height:16px;
  font-family:var(--app-font-family-base);
  font-size:10px;
  font-weight:600;
  line-height:1;
  color:inherit;
}
.prov-identity-icon.err{ background:var(--app-color-negative-subtle); color:var(--app-color-negative); }
.prov-identity-button{
  display:flex; align-items:flex-start; justify-content:flex-start; min-width:0; flex:0 1 auto; width:auto; max-width:100%;
  text-align:left; padding:0;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  color:var(--app-color-text-primary); font-family:var(--app-font-family-base);
}
.prov-name-wrap{ display:flex; align-items:flex-start; flex-wrap:wrap; min-width:0; max-width:100%; line-height:18px; }
.prov-name-lbl{ font-family:var(--app-font-family-base); font-size:12px; font-weight:300; color:var(--app-color-text-primary); letter-spacing:0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.prov-model-lbl{ margin-top:0; margin-right:0; margin-bottom:0; margin-left:5px; font-family:var(--app-font-family-mono); font-size:10px; font-weight:300; color:var(--app-color-text-muted); letter-spacing:0; min-width:0; overflow-wrap:anywhere; }
.prov-status{ display:flex; align-items:center; min-width:0; flex:0 0 auto; margin-top:0; margin-right:0; margin-bottom:0; margin-left:auto; padding-left:12px; font-family:var(--app-font-family-mono); font-size:10px; font-weight:500; }
.sdot{ width:5px; height:5px; border-radius:50%; }
.prov-status .sdot{ margin-right:4px; }
.sdot.ok{ background:var(--app-color-positive); }
.sdot.run{ background:var(--app-color-notice); }
.sdot.err{ background:var(--app-color-negative); }
.sdot.info{ background:var(--app-color-informative); }
.status-inline{ display:flex; align-items:center; }
.status-inline .sdot{ margin-right:6px; }
.status-inline.tight .sdot{ margin-right:4px; }
.status-inline.loose .sdot{ margin-right:8px; }

.prov-status-text{ color:var(--app-color-text-muted); }
.prov-status-text.run{ color:var(--app-color-notice); }
.prov-status-text.ok{ color:var(--app-color-text-muted); }
.prov-status-text.info{ color:var(--app-color-text-muted); }

/* Provider response text */
.prov-response{
  border-top:1px solid var(--app-color-border-default);
  padding:9px 12px 8px;
  background:var(--app-color-background-layer-1);
}
.prov-response-body{
  position:relative;
  max-height:51px;
  overflow:hidden;
}
.prov-response[data-expanded="true"] .prov-response-body{
  max-height:none;
  overflow:visible;
}
.prov-response-text{
  max-width:58ch;
  font-size:12px;
  line-height:17px;
  color:var(--app-color-text-secondary);
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  word-break:break-word;
  user-select:text;
}
.prov-response-body::after{
  content:"";
  position:absolute;
  right:0;
  bottom:0;
  left:0;
  height:16px;
  pointer-events:none;
  background:linear-gradient(180deg, rgba(24,25,31,0), var(--app-color-background-layer-1));
  opacity:0;
}
.prov-response[data-expanded="true"] .prov-response-body::after{
  display:none;
}
.prov-response[data-overflowing="true"] .prov-response-body::after{
  opacity:1;
}
.prov-response-actions{ display:flex; align-items:center; min-width:0; margin-top:5px; }
.prov-response-toggle{
  padding:2px 0;
  border:none;
  background:transparent;
  color:var(--app-color-text-muted);
  font-family:var(--app-font-family-base);
  font-size:11px;
  line-height:15px;
  cursor:pointer;
}
.prov-response-toggle:hover{ color:var(--app-color-text-primary); }
.prov-response-copy{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:8px; color:var(--app-color-text-muted); flex-shrink:0;
  min-height:0; padding:0; border:none; background:transparent;
}
.prov-response-actions .prov-response-copy:first-child{ margin-left:0; }
.prov-response-copy.cp{ color:var(--app-color-positive); }

/* Image result */
.prov-img{ border-top:1px solid var(--app-color-border-default); position:relative; overflow:hidden; background:var(--app-color-background-base); }
.img-result{
  width:100%; max-width:var(--chat-preview-max-width); height:var(--chat-preview-height-default); min-height:180px; max-height:var(--chat-preview-max-height); position:relative;
  margin-top:0;
  margin-right:auto;
  margin-bottom:0;
  margin-left:auto;
  cursor:default; display:flex; align-items:center; justify-content:center;
  background-color:var(--app-color-background-base);
  background-image:linear-gradient(45deg, rgba(255,255,255,.055) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.055) 75%);
  background-size:18px 18px;
}
.img-result.media-landscape{ height:var(--chat-preview-height-landscape); }
.img-result.media-square{ height:var(--chat-preview-height-square); }
.img-result.media-portrait{ height:var(--chat-preview-height-portrait); }
.img-result.media-tall{ height:var(--chat-preview-height-portrait); }
.img-result.media-wide{ height:var(--chat-preview-height-wide); }
.img-result.media-unknown{ height:var(--chat-preview-height-default); }
.img-bg{ max-width:100%; max-height:100%; display:block; object-fit:contain; }
.img-overlay{
  position:absolute; top:0; right:0; bottom:0; left:0;
  background:rgba(7,10,15,.24);
  opacity:0;
  display:flex; align-items:flex-end; justify-content:flex-start; padding:10px 12px;
}
.img-result:hover .img-overlay{ opacity:1; }
.img-meta{
  position:absolute; top:8px; right:8px;
  font-family:var(--app-font-family-mono); font-size:9px; color:rgba(255,255,255,.7);
  background:rgba(0,0,0,.5); padding:2px 6px; border-radius:4px;
  max-width:calc(100% - 16px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:0; pointer-events:none;
}
.img-result:hover .img-meta{ opacity:1; }
.img-count{
  position:absolute;
  top:8px;
  left:8px;
  z-index:2;
  display:flex;
  align-items:center;
  justify-content:center;
  min-width:34px;
  height:18px;
  padding:0 7px;
  border-radius:999px;
  background:rgba(0,0,0,.56);
  color:rgba(255,255,255,.86);
  font-family:var(--app-font-family-mono);
  font-size:9px;
  line-height:18px;
  pointer-events:none;
}
.img-nav{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:32px;
  height:32px;
  min-height:0;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding:0;
  border:none;
  border-radius:999px;
  background:rgba(0,0,0,.46);
  color:rgba(255,255,255,.82);
  cursor:pointer;
  opacity:.72;
}
.img-nav-host{
  position:absolute;
  top:50%;
  z-index:2;
  width:32px;
  height:32px;
  min-width:32px;
  min-height:32px;
}
.img-nav:hover{
  opacity:1;
  background:rgba(0,0,0,.64);
  color:#fff;
}
.img-nav:disabled,
.img-nav.is-disabled{ opacity:.28; cursor:default; }
.img-nav:disabled:hover,
.img-nav.is-disabled:hover{ background:rgba(0,0,0,.46); color:rgba(255,255,255,.82); }
.img-nav-host-prev{ left:10px; margin-top:-16px; }
.img-nav-host-next{ right:10px; margin-top:-16px; }
.img-nav-prev,
.img-nav-next{ width:32px; min-width:32px; height:32px; min-height:32px; }
.img-act{
  display:inline-flex; align-items:center; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  padding:4px 10px; border-radius:var(--app-radius-medium); border:none;
  font-family:var(--app-font-family-base); font-size:11px; font-weight:600; cursor:pointer;
  min-height:0;
}
.img-act .ui-icon-button-label{ font-size:11px; margin-left:5px; }
.img-act.prim{ background:var(--app-color-accent-default); color:var(--app-color-text-on-accent); }
.img-act.prim:hover{ background:var(--app-color-accent-hover); }
.img-act.prim:disabled{ opacity:.78; cursor:default; }
.img-act.sec{ background:var(--app-color-active-overlay); color:var(--app-color-text-primary); }
.img-act.sec:hover{ background:var(--app-color-hover-overlay); }

/* Loading */
.prov-loading{ display:flex; align-items:center; padding:10px 12px; }
.ldots{ display:flex; margin-right:10px; }
.ldot{ width:5px; height:5px; margin-right:4px; border-radius:50%; background:var(--app-color-accent-default); }

/* Action row */
.prov-actions{ border-top:1px solid var(--app-color-border-default); padding:4px 10px; display:flex; align-items:center; justify-content:flex-start; min-width:0; min-height:30px; }
.act-ico{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; color:var(--app-color-text-muted); flex-shrink:0;
  width:28px; height:28px; min-width:28px; min-height:28px; padding:0; border:1px solid transparent; border-radius:var(--app-radius-small); background:transparent;
}
.act-download-host{ width:24px; height:24px; min-width:24px; min-height:24px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; color:var(--app-color-text-muted); }
.act-download{ width:24px; height:24px; min-width:24px; min-height:24px; border-radius:7px; }
.act-download:hover{ background:var(--app-color-hover-overlay); border-color:var(--app-color-border-default); color:var(--app-color-text-primary); }
.act-ico.prim{ color:var(--app-color-accent-default); }

/* Error */
.err-card{
  flex:0 1 auto; min-width:0; width:100%; max-width:var(--chat-result-max-width);
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  background:#4a1819;
  border:1px solid rgba(255,255,255,.04);
  border-radius:12px; padding:11px 13px 8px;
  display:flex; flex-direction:column;
}
.err-top{ display:flex; align-items:center; }
.err-top .prov-identity-icon{
  width:auto; height:auto; min-width:0; min-height:0; margin-right:8px;
  border-radius:0; background:transparent; color:#ffb7b0; font-size:13px; font-weight:700;
}
.err-title{
  font-size:11px; font-weight:600; color:#ffb7b0; font-family:var(--app-font-family-mono);
  letter-spacing:.04em;
}
.err-msg{
  margin-top:7px; font-size:13px; color:#fff4f2; line-height:18px; font-weight:600; padding-left:0;
}
.err-category{
  margin-top:7px;
  font-size:10px;
  line-height:13px;
  color:rgba(255,235,231,.72);
  font-family:var(--app-font-family-mono);
}
.err-detail{
  margin-top:7px;
  font-size:11px;
  line-height:16px;
  color:rgba(255,244,242,.72);
  font-family:var(--app-font-family-mono);
  overflow-wrap:anywhere;
}
.err-request{ margin-top:8px; min-width:0; }
.err-request-label{
  font-size:10px; line-height:12px; color:rgba(255,235,231,.72); letter-spacing:.04em;
  font-family:var(--app-font-family-mono);
}
.err-request-row{ display:inline-flex; align-items:center; min-width:0; max-width:100%; margin-top:3px; }
.err-request-value{
  flex:0 1 auto; min-width:0; color:rgba(255,244,242,.9); font-size:11px; line-height:15px;
  font-family:var(--app-font-family-mono); overflow-wrap:anywhere;
}
.err-actions{ display:flex; align-items:center; align-self:flex-start; min-width:0; margin-top:8px; margin-left:0; }
.err-retry{
  min-height:30px; padding:0 14px; border-radius:8px; border:none;
  background:#cf5a57;
  color:#fff7f5; font-size:11px; font-weight:600; cursor:pointer; font-family:var(--app-font-family-base);
}
.err-retry:hover{ background:#dd6662; }
.err-retry:disabled{ opacity:.45; cursor:not-allowed; }
.err-retry-secondary{
  margin-left:8px;
  background:rgba(255,255,255,.08);
  color:#fff4f2;
}
.err-retry-secondary:hover{ background:rgba(255,255,255,.14); }
.err-copy{
  width:28px; height:28px; min-width:28px; min-height:28px; padding:0; margin-left:5px;
  border:1px solid rgba(255,255,255,.08); border-radius:8px; background:rgba(255,255,255,.03);
  color:rgba(255,244,242,.78); cursor:pointer; flex:0 0 auto;
}
.err-copy:hover{ background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.16); color:#fff4f2; }
.err-copy:disabled{ opacity:.45; cursor:not-allowed; }
.err-copy.cp{ color:#9fe3b0; border-color:rgba(159,227,176,.28); }
.row-retry{
  margin-left:auto; padding:2px 8px; border-radius:var(--app-radius-small); border:1px solid var(--app-color-negative);
  background:transparent; color:var(--app-color-negative); font-size:10px; font-weight:500; cursor:pointer; font-family:var(--app-font-family-base);
}
.row-retry:hover{ background:var(--app-color-negative-subtle); }
.round-billing-meta{
  display:inline-flex;
  align-items:center;
  min-height:22px;
  margin-right:8px;
  color:var(--app-color-text-muted);
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
}
.prov-actions-text-meta{
  border-top:none;
  padding-top:7px;
  padding-bottom:7px;
}

/* Empty */
.conv-empty{
  flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:24px; text-align:center;
}
.empty-hints{ display:flex; flex-direction:column; width:100%; max-width:270px; margin-top:14px; }
.empty-hint{
  margin-top:0; margin-right:0; margin-bottom:5px; margin-left:0;
  background:var(--app-color-background-layer-2); border:1px solid var(--app-color-border-default); border-radius:var(--app-radius-medium);
  display:block; width:100%;
  padding:7px 12px; font-size:12px; color:var(--app-color-text-secondary); text-align:left; cursor:pointer; font-family:var(--app-font-family-base); line-height:16px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.empty-hint:hover{ border-color:var(--app-color-border-strong); color:var(--app-color-text-primary); background:var(--app-color-background-elevated); }

/* Round highlight flash (static class, no animations) */
.round-flash{ background:var(--app-color-informative-subtle) !important; }
.round-flash .user-bubble{ background:var(--app-color-informative-subtle) !important; }
.round-flash .prov-card{ border-color:var(--app-color-informative) !important; }
`;

/** History / Settings 共享样式、Provider row、status notice。 */
export const PAGES_CSS = `
/* History / Settings shared */
.filter-bar{ display:flex; align-items:center; min-width:0; padding:8px 12px; border-bottom:1px solid var(--app-color-border-default); background:var(--app-color-background-layer-1); flex-shrink:0; overflow-x:auto; scrollbar-width:none; }
.filter-bar::-webkit-scrollbar{ display:none; }
.fchip{ margin-right:6px; flex-shrink:0; }
.task-row{ display:flex; align-items:flex-start; box-sizing:border-box; height:86px; min-height:86px; padding:10px 16px; border-bottom:1px solid var(--app-color-border-default); background:transparent; cursor:pointer; overflow:hidden; }
.task-row:hover{ background:var(--app-color-hover-overlay); }
.history-list .ui-list-item-spaced{ margin-top:0; }
.history-list-state.ui-list-item-shell{ align-items:flex-start; min-height:66px; padding:11px 16px; border:0; background:transparent; cursor:default; }
.history-list-state.ui-list-item-shell:hover{ background:transparent; }
.history-list-state .ui-list-item-title{ font-weight:400; }
.task-thumb{ width:64px; height:64px; margin-right:12px; border-radius:7px; background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-default); display:flex; align-items:center; justify-content:center; flex:0 0 64px; overflow:hidden; }
.task-info{ flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.task-prompt{ min-width:0; height:16px; line-height:16px; font-size:12px; color:var(--app-color-text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.task-meta{ display:flex; align-items:center; flex-wrap:nowrap; min-width:0; height:14px; margin-top:3px; overflow:hidden; }
.task-meta-dot{ margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; color:var(--app-color-border-strong); }
.history-preview-image{ width:100%; height:100%; object-fit:contain; border-radius:inherit; }
.history-meta-mono{ font-family:var(--app-font-family-mono); font-size:10px; color:var(--app-color-text-muted); }
.task-bottom{ display:flex; align-items:center; justify-content:space-between; min-width:0; height:24px; margin-top:2px; }
.history-status-inline{ min-width:0; margin-top:0; }
.history-execution-error{ margin-top:4px; font-family:var(--app-font-family-mono); font-size:10px; line-height:14px; color:var(--app-color-text-muted); overflow-wrap:anywhere; }
.history-status-label{ font-size:10px; color:var(--app-color-text-secondary); }
.history-status-label[data-status="queued"]{ color:var(--app-color-informative); }
.history-status-label[data-status="ok"],.history-status-label[data-status="completed-without-image-output"]{ color:var(--app-color-positive); }
.history-status-label[data-status="running"]{ color:var(--app-color-notice); }
.history-status-label[data-status="err"]{ color:var(--app-color-negative); }
.task-actions{ display:flex; align-items:center; justify-content:flex-end; min-width:0; margin-left:8px; }
	.row-icon-action{ margin-left:6px; width:24px; height:24px; min-width:24px; min-height:0; padding:0; display:flex; align-items:center; justify-content:center; color:var(--app-color-text-muted); border:none; background:transparent; }
.task-actions .row-icon-action:first-child{ margin-left:0; }
.row-icon-action:hover{ color:var(--app-color-text-primary); background:var(--app-color-hover-overlay); }
.history-place-action{ color:var(--app-color-accent-default); }
.history-place-action:hover{ color:var(--app-color-accent-hover); background:var(--app-color-accent-subtle); }
.history-retry-action-host{ color:var(--app-color-negative); }
.history-retry-action:hover{ color:var(--app-color-negative); background:var(--app-color-negative-subtle); }
.sec-lbl{
  padding:12px 16px 6px;
  font-size:11px;
  line-height:14px;
  font-weight:500;
  color:var(--app-color-text-muted);
  letter-spacing:.9px;
  text-transform:uppercase;
}

/* Provider row —— 删除固定 height:64px，改为 min-height 允许内容换行；
 * 名称优先，辅助 tag / dots / chevron 退居其后；状态不仅靠颜色圆点。 */
.prov-row{ display:flex; align-items:center; padding:8px 14px; min-height:56px; border-top:1px solid var(--app-color-border-default); cursor:pointer; }
.prov-row:hover{ background:var(--app-color-hover-overlay); }
.settings-provider-row{ border-radius:0; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; outline:none; }
.settings-provider-row:focus-visible{ outline:2px solid var(--app-color-focus-ring); outline-offset:-1px; background:var(--app-color-hover-overlay); }
.settings-provider-row:active{ background:var(--app-color-active-overlay); }
.prov-leading{ display:flex; align-items:center; flex-shrink:0; margin-right:8px; }
.prov-ico{
  width:36px;
  height:36px;
  border:1px solid var(--app-color-border-default);
  border-radius:10px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  font-family:var(--app-font-family-mono);
  font-size:11px;
  font-weight:500;
}
.provider-brand-icon{ width:24px; height:24px; display:block; object-fit:contain; }
.provider-brand-icon-grsai{ filter:invert(1); }
.provider-brand-icon-runninghub{ width:22px; height:22px; border-radius:6px; }
@media (prefers-color-scheme: light){ .provider-brand-icon-grsai{ filter:none; } }
.profile-model-avatar{ background:var(--app-color-background-layer-2); color:var(--app-color-accent-default); }
.profile-model-avatar-suggestion{ color:var(--app-color-informative); }
.prov-content{ flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; }
.prov-title-row{ display:flex; align-items:center; min-width:0; }
.prov-name{ min-width:0; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:16px; font-size:12px; font-weight:600; color:var(--app-color-text-primary); }
.prov-primary-status{ flex-shrink:0; margin-top:0; margin-left:6px; }
.prov-meta-row{ display:flex; align-items:center; min-width:0; margin-top:1px; font-size:10px; line-height:14px; color:var(--app-color-text-secondary); }
.prov-model{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-family:var(--app-font-family-mono);
  color:var(--app-color-text-primary);
  opacity:.84;
}
.prov-family{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-family:var(--app-font-family-base);
  color:var(--app-color-text-secondary);
  letter-spacing:0;
}
.provider-row-meta{ flex:0 1 auto; max-width:100%; }
.prov-meta-sep{ flex-shrink:0; color:var(--app-color-border-strong); margin-right:4px; margin-left:4px; }
.prov-summary{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-family:var(--app-font-family-base);
  color:var(--app-color-text-secondary);
}
.prov-summary-mono{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-family:var(--app-font-family-mono);
  color:var(--app-color-text-primary);
  opacity:.84;
  letter-spacing:.02em;
}
.badge{ padding:1px 7px; border-radius:var(--app-radius-small); font-size:10px; font-weight:500; flex-shrink:0; }
.badge.active{ background:var(--app-color-positive-subtle); color:var(--app-color-positive); }
.badge.connected{ background:var(--app-color-informative-subtle); color:var(--app-color-informative); }
.badge.error{ background:var(--app-color-negative-subtle); color:var(--app-color-negative); }
.badge.none{ background:var(--app-color-hover-overlay); color:var(--app-color-text-muted); }
.prov-end{ display:flex; align-items:center; flex-shrink:0; min-width:0; margin-left:8px; }
.prov-readiness{ display:flex; align-items:center; min-width:0; flex-shrink:0; margin-right:8px; }
.prov-readiness-dot{ width:8px; height:8px; border-radius:50%; background:var(--app-color-border-default); }
.prov-readiness-dot{ margin-right:6px; }
.prov-readiness.ready .prov-readiness-dot{ background:var(--app-color-positive); }
.prov-readiness.warning .prov-readiness-dot{ background:var(--app-color-notice); }
.prov-readiness.configured .prov-readiness-dot{ background:var(--app-color-informative); }
.settings-provider-row .prov-readiness-compact{ justify-content:center; }
.settings-provider-row .prov-readiness-compact .prov-readiness-dot{ margin-right:0; margin-bottom:0; }
.prov-trail{ display:flex; align-items:center; flex-shrink:0; color:var(--app-color-text-muted); }
.prov-status-text{ font-family:var(--app-font-family-mono); font-size:10px; color:var(--app-color-text-secondary); flex-shrink:0; }
.settings-provider-row.is-disabled .prov-leading,
.settings-provider-row.is-disabled .prov-content{ opacity:.62; }
.settings-provider-row.is-special .prov-name{ color:var(--app-color-text-primary); }
.settings-detail-layout{
  width:100%;
  max-width:760px;
  margin-top:0;
  margin-right:auto;
  margin-bottom:0;
  margin-left:auto;
}
.settings-detail-layout-editor{
  padding-bottom:8px;
}
.settings-page{
  --settings-section-padding:10px 14px;
  --settings-field-gap:10px;
  --settings-section-gap:12px;
  --settings-subsection-gap:8px;
  --settings-footer-padding-y:8px;
  --settings-footer-padding-x:14px;
}
.settings-page .settings-backend-segments{
  min-height:36px;
  padding:4px 8px;
  border-bottom:1px solid var(--app-color-border-default);
}
.settings-backend-segments .fchip{
  flex:1 1 0;
  min-width:0;
  min-height:28px;
}
.settings-backend-segments .ui-segmented-tab{
  min-height:26px;
  border-color:transparent;
  background:transparent;
}
.settings-backend-segments .ui-segmented-tab-spaced{ margin-left:2px; }
.settings-page .settings-backend-segments .ui-segmented-tab[aria-selected="true"]{
  border-color:transparent;
  border-bottom-color:var(--app-color-accent-default);
  border-radius:0;
  background:transparent;
  color:var(--app-color-text-primary);
}
.settings-empty-state{
  padding:16px;
  min-height:48px;
  font-size:12px;
  line-height:16px;
  color:var(--app-color-text-muted);
}
.settings-empty-action{ margin-top:10px; }
.settings-field-action-row{ display:flex; align-items:center; min-width:0; }
.settings-field-action-row .field-input{ flex:1 1 auto; min-width:0; }
.settings-field-action-row .ui-btn{ flex:0 0 auto; margin-left:8px; }
.comfyui-connection-field .ui-field-group-label{
  font-size:10px;
  line-height:14px;
  font-weight:500;
  color:var(--app-color-text-muted);
}
.comfyui-connection-controls{
  flex-direction:row;
  align-items:stretch;
}
.comfyui-connection-controls .field-input{ flex:1 1 auto; min-width:0; height:32px; }
.comfyui-connection-controls .ui-btn{
  display:flex;
  align-items:center;
  justify-content:center;
  width:112px;
  min-width:112px;
  min-height:32px;
  margin-left:8px;
}
.comfyui-connection-spinner{ display:inline-flex; align-items:center; justify-content:center; margin-right:5px; }
.comfyui-connection-status{
  display:block;
  min-height:32px;
  max-height:32px;
  overflow:hidden;
  line-height:16px;
}
.comfyui-connection-status-line{
  display:block;
  min-width:0;
  overflow:hidden;
  overflow-wrap:anywhere;
  word-break:break-word;
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:1;
}
.comfyui-workflow-list{
  overflow:hidden;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
}
.comfyui-workflow-list .settings-provider-row{ border-top:0; }
.comfyui-workflow-picker-heading{
  display:flex;
  align-items:center;
  justify-content:flex-start;
  width:100%;
}
.comfyui-workflow-picker-heading .settings-icon-button{
  width:24px;
  min-width:24px;
  height:24px;
  margin-top:-4px;
  margin-right:4px;
  margin-bottom:-4px;
  margin-left:-4px;
}
.comfyui-workflow-picker-group{ margin-top:12px; }
.comfyui-workflow-picker-group-title{
  margin-top:0;
  margin-right:0;
  margin-bottom:6px;
  margin-left:0;
  font-size:10px;
  line-height:14px;
  font-weight:500;
  color:var(--app-color-text-muted);
}
.comfyui-workflow-picker-group .ui-list{
  overflow:hidden;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
}
.comfyui-workflow-picker-group .settings-provider-row:first-child{ border-top:0; }
.panel[data-panel-width-mode="compact"] .settings-field-action-row{
  flex-direction:column;
  align-items:stretch;
}
.panel[data-panel-width-mode="compact"] .settings-field-action-row .ui-btn{
  width:100%;
  margin-top:8px;
  margin-left:0;
}
.panel[data-panel-width-mode="compact"] .comfyui-connection-controls{
  flex-direction:row;
  align-items:stretch;
}
.panel[data-panel-width-mode="compact"] .comfyui-connection-controls .ui-btn{
  width:112px;
  margin-top:0;
  margin-left:8px;
}
.settings-page .section{ padding:var(--settings-section-padding); }
.settings-page .section + .section{
  border-top:1px solid var(--app-color-border-default);
}
.section-title{ font-size:11px; font-weight:600; color:var(--app-color-text-secondary); letter-spacing:.3px; margin-bottom:12px; }
.settings-page .section-title{
  margin-bottom:var(--settings-field-gap);
}
.settings-page .ui-settings-form-section h2{
  font-size:11px;
  font-weight:600;
  letter-spacing:.3px;
  margin-bottom:var(--settings-field-gap);
}
.settings-page .ui-field-group{ margin-bottom:0; }
.settings-page .ui-field-group + .ui-field-group{ margin-top:var(--settings-field-gap); }
.settings-page .settings-section-heading,
.settings-page .generation-settings-section .section-title{
  font-size:12px;
  line-height:16px;
  font-weight:600;
  color:var(--app-color-text-primary);
  letter-spacing:.01em;
}
.settings-page .settings-subsection-heading{
  font-size:11px;
  line-height:15px;
  font-weight:600;
  color:var(--app-color-text-secondary);
  margin-bottom:var(--settings-subsection-gap);
}
.settings-section-heading{ color:var(--app-color-text-secondary); }
.settings-subsection-heading{ margin-bottom:8px; color:var(--app-color-text-secondary); }
.settings-page .field{ margin-bottom:var(--settings-field-gap); }
.field{ margin-bottom:12px; }
.settings-section-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:8px;
}
.settings-section-header .section-title{ margin-bottom:0; }
.settings-section-header-actions{
  display:flex;
  align-items:center;
  flex-shrink:0;
}
.settings-section-header-actions > *{ margin-right:6px; }
.settings-section-header-actions > *:last-child{ margin-right:0; }
.settings-subsection-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:var(--settings-subsection-gap);
}
.settings-subsection-header .section-title{ margin-bottom:0; }
.settings-field-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  margin-bottom:4px;
}
.settings-field-header .ui-field-label{ margin-bottom:0; }
.settings-field-header-actions{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  justify-content:flex-end;
  flex-shrink:0;
  margin-left:12px;
}
.settings-field-header-actions > *{ margin-right:6px; }
.settings-field-header-actions > *:last-child{ margin-right:0; }
.settings-secret-meta-inline{
  font-size:10px;
  line-height:14px;
  color:var(--app-color-text-secondary);
  white-space:nowrap;
}
.settings-inline-action{
  min-height:26px;
  padding:3px 8px;
  font-size:11px;
  border-radius:var(--app-radius-small);
}
.settings-icon-button{
  width:32px;
  min-width:32px;
  height:32px;
  min-height:32px;
  padding:0;
}
.test-status{
  display:inline-flex;
  align-items:center;
  font-size:11px;
  line-height:15px;
  color:var(--app-color-text-muted);
}
.test-status-positive{ color:var(--app-color-positive); }
.test-status-negative{ color:var(--app-color-negative); }
.field:last-child{ margin-bottom:0; }
.field-input{ width:100%; }
.settings-secret-meta{
  margin-top:0;
  margin-right:0;
  margin-bottom:6px;
  margin-left:0;
  font-size:11px;
  line-height:16px;
  color:var(--app-color-text-secondary);
}
.settings-secret-actions{
  display:flex;
  flex-direction:row;
  flex-wrap:wrap;
  align-items:center;
  margin-top:0;
  margin-right:0;
  margin-bottom:8px;
  margin-left:0;
}
.settings-secret-action{
  min-height:26px;
  padding-top:4px;
  padding-right:8px;
  padding-bottom:4px;
  padding-left:8px;
  font-size:11px;
}
.settings-secret-action + .settings-secret-action{
  margin-left:8px;
}
.prompt-template-list{
  margin-top:0;
  margin-right:0;
  margin-bottom:var(--settings-field-gap);
  margin-left:0;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
  overflow:hidden;
  background:var(--app-color-background-layer-2);
}
.prompt-template-list .ui-list-item-spaced{
  margin-top:0;
}
.prompt-template-row{
  position:relative;
  display:block;
  min-height:36px;
  padding-top:4px;
  padding-right:4px;
  padding-bottom:4px;
  padding-left:8px;
  border-top:1px solid var(--app-color-border-default);
  outline:none;
  cursor:pointer;
}
.prompt-template-row .ui-list-item-shell__main{ min-width:0; }
.prompt-template-row .ui-list-item-shell__trailing{ display:flex; align-items:center; }
.prompt-template-row:first-child{
  border-top:none;
}
.prompt-template-row:hover{
  background:var(--app-color-hover-overlay);
}
.prompt-template-row:active{
  background:var(--app-color-active-overlay);
}
.prompt-template-row:focus-visible{
  outline:2px solid var(--app-color-focus-ring);
  outline-offset:-2px;
}
.prompt-template-row.is-selected{ background:var(--app-color-accent-subtle); }
.prompt-template-row.is-invalid{
  background:var(--app-color-negative-subtle);
}
.prompt-template-row.prompt-template-list-state{
  cursor:default;
}
.prompt-template-row.prompt-template-list-state:hover,
.prompt-template-row.prompt-template-list-state:active{
  background:transparent;
}
.prompt-template-list-state-copy{
  flex:1 1 auto;
  min-width:0;
}
.prompt-template-list-state-description{
  display:block;
  margin-top:1px;
  overflow-wrap:anywhere;
  font-size:10px;
  line-height:14px;
  color:var(--app-color-text-secondary);
}
.prompt-template-list-state--error .prompt-template-list-state-description{
  color:var(--app-color-negative);
}
.prompt-template-indicator{
  position:absolute;
  top:0;
  left:0;
  bottom:0;
  width:3px;
  background:transparent;
}
.prompt-template-indicator[data-selected="true"]{
  background:var(--app-color-accent-default);
}
.prompt-template-row-main{
  display:flex;
  align-items:center;
  min-width:0;
  min-height:26px;
}
.prompt-template-radio{
  width:9px;
  min-width:9px;
  height:9px;
  margin-right:6px;
  border:1px solid var(--app-color-border-strong);
  border-radius:50%;
  background:transparent;
  flex-shrink:0;
}
.prompt-template-radio[data-selected="true"]{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-default);
}
.prompt-template-name{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:12px;
  line-height:15px;
  font-weight:500;
  color:var(--app-color-text-primary);
}
.prompt-template-mode{
  flex:0 0 auto;
  min-width:0;
  margin-left:6px;
  font-family:var(--app-font-family-mono);
  font-size:9px;
  line-height:13px;
  letter-spacing:.02em;
  color:var(--app-color-text-secondary);
  text-align:right;
  opacity:.8;
}
.prompt-template-mode.is-invalid{
  color:var(--app-color-negative);
}
.prompt-template-actions{
  display:flex;
  align-items:center;
  flex:0 0 auto;
  margin-left:2px;
}
.prompt-template-action-host,
.prompt-template-action-overlay{
  width:24px;
  min-width:24px;
  height:24px;
  min-height:24px;
}
.prompt-template-action{
  width:24px;
  min-width:24px;
  height:24px;
  min-height:24px;
  margin-left:0;
  color:var(--app-color-text-muted);
  opacity:.62;
}
.prompt-template-action:hover,
.prompt-template-action:focus-visible{
  color:var(--app-color-text-primary);
  opacity:1;
}
.prompt-template-action.danger{
  opacity:.48;
}
.prompt-template-section-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:8px;
}
.prompt-template-section-header h2{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
}
.prompt-template-error{
  margin-top:3px;
  margin-right:0;
  margin-bottom:0;
  margin-left:16px;
}
.settings-select{ width:100%; min-width:0; }
.settings-page .settings-select .cmp-chip-text{
  min-height:30px;
}
.generation-settings-grid{ display:flex; align-items:stretch; min-width:0; }
.generation-settings-grid .field{ flex:1 1 0; min-width:0; margin-right:12px; }
.generation-settings-grid .field:last-child{ margin-right:0; }
.settings-select .cmp-chip-text{
  width:100%;
  justify-content:flex-start;
  text-align:left;
}
.settings-select .cmp-chip-body-text{
  width:100%;
  justify-content:space-between;
}
.settings-select .cmp-chip-value-text{
  justify-content:flex-start;
  text-align:left;
  color:var(--app-color-text-primary);
}
.generation-settings-layout{
  padding-top:8px;
  padding-right:0;
  padding-bottom:0;
  padding-left:0;
}
.generation-settings-section{
  padding-top:14px;
  padding-right:16px;
  padding-bottom:14px;
  padding-left:16px;
}
.generation-settings-section + .generation-settings-section{
  border-top:1px solid var(--app-color-border-default);
}
.generation-settings-secondary-section{
  background:transparent;
}
.generation-settings-meta-section{
  padding-top:10px;
  padding-bottom:10px;
}
.generation-settings-meta{
  font-size:11px;
  line-height:16px;
  color:var(--app-color-text-muted);
  white-space:pre-wrap;
}
.global-settings-path-list{ margin-right:-16px; margin-left:-16px; }
.global-settings-path-list .settings-provider-row{ padding-right:16px; padding-left:16px; }
.global-settings-path-list .prov-trail{ display:none; }
.global-settings-path-icon{ color:var(--app-color-text-muted); }
.global-settings-path-value{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:var(--app-color-text-muted);
  font-family:var(--app-font-family-mono);
}
.global-settings-path-copy{ color:var(--app-color-text-muted); }
.global-settings-path-copy.cp{ color:var(--app-color-positive); }
.page-header-meta{
  flex:1;
  min-width:0;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:8px;
}
.page-header-title{
  flex:0 1 auto;
  width:auto;
  max-width:100%;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
}
.field-textarea{ display:block; }
.field-textarea-shell{
  margin-top:6px;
  width:100%;
  min-height:112px;
}
.field-textarea-input,
.field-textarea-native{
  width:100%;
  min-height:110px;
  font-family:var(--app-font-family-mono);
  font-size:12px;
  line-height:18px;
}
.provider-system-instructions-field{
  margin-top:14px;
}
.provider-system-instructions-field .field-textarea-shell{
  min-height:72px;
}
.provider-system-instructions-field .field-textarea-input,
.provider-system-instructions-field .field-textarea-native{
  min-height:70px;
}
.field-hint{ margin-top:4px; color:var(--app-color-text-muted); }
.field-input-affordance{
  display:flex;
  align-items:stretch;
  width:100%;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
  background:var(--app-color-background-layer-2);
  overflow:hidden;
}
.field-input-affordance:focus-within{
  border-color:var(--app-color-focus-ring);
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:-1px;
}
.field-input-affordance .field-input-embedded{
  flex:1;
  min-width:0;
  /* sp-textfield 影子输入层由 --mod-textfield-* 变量绘制；外层 affordance 独占边框与背景。 */
  --mod-textfield-background-color:transparent;
  --mod-textfield-border-width:0px;
  --mod-textfield-border-color:transparent;
  --mod-textfield-corner-radius:0px;
  --mod-textfield-focus-indicator-width:0px;
  --mod-textfield-focus-indicator-color:transparent;
  --mod-textfield-border-color-focus:transparent;
  --mod-textfield-border-color-keyboard-focus:transparent;
  --mod-textfield-background-color-disabled:transparent;
  --mod-textfield-border-color-disabled:transparent;
  background:transparent;
}
.field-input-shell{
  min-height:32px;
}
.field-input-shell[data-disabled="true"]{
  opacity:.72;
}
.field-input-shell[data-native-editor-suspended="true"]{
  background:color-mix(in srgb, var(--app-color-background-layer-2) 88%, transparent);
}
.field-input-action{
  width:32px; min-width:32px; height:32px; min-height:32px;
  padding:0;
  color:var(--app-color-text-muted);
  border:none; border-left:1px solid var(--app-color-border-default);
  border-radius:0; background:transparent;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  box-sizing:border-box;
  line-height:0;
}
.field-input-affordance:focus-within .field-input-action{
  border-left-color:var(--app-color-focus-ring);
}
.field-input-action-host{
  flex:0 0 auto;
}
.field-input-action-host-clear{
  width:0;
  min-width:0;
  opacity:0;
  overflow:hidden;
  pointer-events:none;
}
.field-input-affordance:hover .field-input-action-host-clear,
.field-input-affordance:focus-within .field-input-action-host-clear,
.field-input-action-host-clear.field-input-action-host-persistent{
  width:32px;
  min-width:32px;
  opacity:1;
  pointer-events:auto;
}
.field-input-action-secondary{
  border-left:1px solid var(--app-color-border-default);
}
.field-input-affordance:focus-within .field-input-action-secondary{
  border-left-color:var(--app-color-focus-ring);
}
.test-area{ padding:16px; border-top:1px solid var(--app-color-border-default); display:flex; flex-direction:column; }
.test-area .ui-button-block{ width:100%; }
.settings-page .test-area{
  padding:14px var(--settings-section-padding);
}
.settings-page .test-area .test-btn{
  width:auto;
  align-self:flex-start;
}
.settings-action-row{
  display:flex;
  align-items:center;
  justify-content:flex-start;
}
.test-meta{ margin-top:8px; font-family:var(--app-font-family-mono); font-size:11px; color:var(--app-color-text-muted); }
.scroll-footer-pad{ padding-bottom:128px; }
.scroll-footer-pad-detail{ padding-bottom:24px; }
.det-footer{ flex-shrink:0; padding:12px 16px; border-top:1px solid var(--app-color-border-default); display:flex; min-width:0; background:var(--app-color-background-base); }
.settings-page .det-footer{
  padding:var(--settings-footer-padding-y) var(--settings-footer-padding-x);
}
.settings-page{
  --app-header-height:40px;
}
.settings-page .hdr{
  height:40px;
  padding:0 10px;
}
.settings-page .hdr-btn{
  width:28px;
  min-width:28px;
  height:28px;
}
.settings-page .hdr-title{
  font-size:13px;
  line-height:17px;
}
.settings-detail-footer-inner{
  width:100%;
  max-width:760px;
  margin-top:0;
  margin-right:auto;
  margin-bottom:0;
  margin-left:auto;
  display:flex;
  flex:1 1 auto;
  min-width:0;
  align-items:center;
  justify-content:space-between;
}
.settings-detail-footer-inner > *{ margin-right:12px; }
.settings-detail-footer-inner > *:last-child{ margin-right:0; }
.settings-detail-footer-actions{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  min-width:0;
}
.settings-detail-footer-help{
  display:block;
  max-width:40ch;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
  font-size:10px;
  line-height:14px;
  color:var(--app-color-text-muted);
}
.settings-detail-footer-actions > *{ margin-right:8px; }
.settings-detail-footer-actions > *:last-child{ margin-right:0; }
.settings-detail-footer-save-group{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  justify-content:flex-end;
  flex-shrink:0;
}
.settings-detail-footer-save-group > *{ margin-left:10px; }
.settings-detail-footer-save-group > *:first-child{ margin-left:0; }
.settings-page .btn-save{ flex:0 1 auto; min-width:120px; }
.settings-page .btn-cancel{
  margin-left:0;
  align-self:center;
}
.settings-detail-footer-actions .test-meta{
  font-family:var(--app-font-family-mono);
  font-size:11px;
  color:var(--app-color-text-muted);
  white-space:nowrap;
}

.field-help{
  display:flex;
  align-items:flex-start;
  min-width:0;
  background:transparent;
}
.field-help-icon{
  flex:0 0 auto;
  width:14px;
  height:14px;
  margin-top:1px;
  margin-right:6px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color:var(--app-color-text-muted);
}
.field-help[data-tone="negative"] .field-help-icon{
  color:var(--app-color-negative);
}
.field-help-text{
  flex:1;
  min-width:0;
}
.provider-model-field-help{
  margin-top:6px;
  margin-left:24px;
}
.status-warning-slot,
.status-empty-state,
.status-replacement-slot{
  margin-top:var(--settings-field-gap);
}
.status-warning-slot:first-child,
.status-empty-state:first-child,
.status-replacement-slot:first-child{
  margin-top:0;
}
.status-notice{
  --status-notice-background:var(--app-notice-neutral-background);
  --status-notice-foreground:var(--app-notice-neutral-foreground);
  --status-notice-icon:var(--app-notice-neutral-icon);
  display:flex;
  flex-wrap:wrap;
  align-items:flex-start;
  min-width:0;
  min-height:36px;
  padding:8px 10px;
  border:none;
  border-radius:7px;
  background:var(--status-notice-background);
  color:var(--status-notice-foreground);
  box-sizing:border-box;
}
.status-notice.success{ --status-notice-background:var(--app-notice-positive-background); --status-notice-foreground:var(--app-notice-positive-foreground); --status-notice-icon:var(--app-notice-positive-icon); }
.status-notice.info{ --status-notice-background:var(--app-notice-info-background); --status-notice-foreground:var(--app-notice-info-foreground); --status-notice-icon:var(--app-notice-info-icon); }
.status-notice.warning{ --status-notice-background:var(--app-notice-warning-background); --status-notice-foreground:var(--app-notice-warning-foreground); --status-notice-icon:var(--app-notice-warning-icon); }
.status-notice.error{ --status-notice-background:var(--app-notice-negative-background); --status-notice-foreground:var(--app-notice-negative-foreground); --status-notice-icon:var(--app-notice-negative-icon); }
.status-notice[data-tone="neutral"]{ --status-notice-background:var(--app-notice-neutral-background); --status-notice-foreground:var(--app-notice-neutral-foreground); --status-notice-icon:var(--app-notice-neutral-icon); }
.status-icon{
  flex:0 0 auto; width:14px; height:14px; margin-top:2px; margin-right:8px;
  display:inline-flex; align-items:center; justify-content:center; color:var(--status-notice-icon);
}
.status-body{
  flex:1 1 160px;
  min-width:0;
}
.status-message{
  min-width:0; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere;
  font-family:var(--app-font-family-base); font-size:13px; line-height:18px; font-weight:500;
  color:var(--status-notice-foreground); user-select:text; -webkit-user-select:text;
}
.status-description{
  min-width:0;
  margin-top:4px;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  white-space:pre-wrap;
  word-break:break-word;
  overflow-wrap:anywhere;
  font-family:var(--app-font-family-base);
  font-size:12px;
  line-height:17px;
  font-weight:400;
  color:var(--app-color-text-secondary);
  user-select:text;
  -webkit-user-select:text;
}
.status-detail{
  min-width:0;
  margin-top:8px;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  white-space:pre-wrap;
  word-break:break-word;
  overflow-wrap:anywhere;
  font-family:var(--app-font-family-mono);
  font-size:11px;
  line-height:16px;
  font-weight:400;
  color:var(--app-color-text-secondary);
  user-select:text;
  -webkit-user-select:text;
}
.status-actions{
  display:flex;
  flex:0 0 auto;
  flex-wrap:wrap;
  align-items:flex-start;
  justify-content:flex-end;
  min-width:0;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:8px;
}
.status-actions > *{
  margin-right:4px;
}
.status-actions > *:last-child{
  margin-right:0;
}
.status-action{
  min-height:24px;
  padding:2px 6px;
  border-radius:6px;
  font-size:11px;
  line-height:16px;
  color:var(--app-color-text-secondary);
}
.status-action:hover{
  color:var(--app-color-text-primary);
}
.status-copy{
  flex-shrink:0; align-self:flex-start; margin-left:0;
  width:24px; min-width:24px; height:24px; min-height:24px; padding:0; color:var(--app-color-text-muted);
  display:inline-flex; align-items:center; justify-content:center; opacity:.9;
  border:none; border-radius:6px; background:transparent;
}
.status-copy:hover{ background:var(--app-color-hover-overlay); opacity:1; color:var(--app-color-text-primary); }
.status-copy.cp{ color:var(--app-color-positive); }

.generation-settings-footer{
  justify-content:flex-end;
}
.generation-settings-footer .btn-save{
  flex:0 1 240px;
  min-width:160px;
}

@media (max-width: 420px){
  .btn-cancel{
    margin-left:0;
  }
  .generation-settings-grid{
    flex-wrap:wrap;
  }
  .generation-settings-grid .field{
    flex:1 1 calc(50% - 6px);
    margin-bottom:8px;
  }
  .generation-settings-grid .field:nth-child(2){
    margin-right:0;
  }
  .generation-settings-grid .field:last-child{
    flex-basis:100%;
    margin-right:0;
    margin-bottom:0;
  }
  .generation-settings-footer .btn-save{
    flex:1 1 100%;
    min-width:0;
  }
}
@media (max-width: 360px){
  .settings-field-action-row{
    flex-direction:column;
    align-items:stretch;
  }
  .settings-field-action-row .ui-btn{ width:100%; margin-top:8px; margin-left:0; }
  .comfyui-connection-controls{
    flex-direction:row;
    align-items:stretch;
  }
  .comfyui-connection-controls .ui-btn{ width:112px; margin-top:0; margin-left:8px; }
  .settings-backend-segments .fchip{
    flex:1 1 0;
    min-width:0;
  }
  .generation-settings-grid{
    flex-direction:column;
    flex-wrap:nowrap;
  }
  .generation-settings-grid .field{
    flex:1 1 auto;
    margin-right:0;
    margin-bottom:8px;
  }
  .generation-settings-grid .field:last-child{
    margin-bottom:0;
  }
  .settings-detail-footer-inner{
    flex-wrap:wrap;
  }
  .scroll-footer-pad-detail{
    padding-bottom:80px;
  }
  .generation-settings-footer .btn-save{
    flex:1 1 100%;
  }
}
`;

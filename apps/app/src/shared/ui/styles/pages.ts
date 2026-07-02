/** History / Settings 共享样式、Provider row、status notice。 */
export const PAGES_CSS = `
/* History / Settings shared */
.filter-bar{ display:flex; align-items:center; min-width:0; padding:8px 12px; border-bottom:1px solid var(--app-color-border-default); background:var(--app-color-background-layer-1); flex-shrink:0; overflow-x:auto; scrollbar-width:none; }
.filter-bar::-webkit-scrollbar{ display:none; }
.fchip{ margin-right:6px; flex-shrink:0; }
.task-row{ display:flex; align-items:flex-start; padding:11px 16px; border-bottom:1px solid var(--app-color-border-default); cursor:pointer; }
.task-row:hover{ background:var(--app-color-hover-overlay); }
.task-thumb{ width:44px; height:44px; margin-right:12px; border-radius:var(--app-radius-medium); background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-default); display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
.task-info{ flex:1; min-width:0; display:flex; flex-direction:column; }
.task-prompt{ font-size:12px; line-height:16px; color:var(--app-color-text-primary); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.task-meta{ display:flex; align-items:center; flex-wrap:wrap; min-width:0; margin-top:3px; }
.task-meta-dot{ margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; color:var(--app-color-border-strong); }
	.row-icon-action{ margin-left:6px; width:24px; height:24px; min-width:24px; min-height:0; padding:0; display:flex; align-items:center; justify-content:center; color:var(--app-color-text-muted); border:none; background:transparent; }
	.row-icon-action:first-of-type{ margin-left:auto; }
.row-icon-action:hover{ color:var(--app-color-text-primary); background:var(--app-color-hover-overlay); }
.sec-lbl{ padding:12px 16px 8px; font-size:11px; font-weight:600; color:var(--app-color-text-muted); letter-spacing:.6px; }

/* Provider row —— 删除固定 height:64px，改为 min-height 允许内容换行；
 * 名称优先，辅助 tag / dots / chevron 退居其后；状态不仅靠颜色圆点。 */
.prov-row{ display:flex; align-items:center; padding:10px 16px; min-height:56px; border-top:1px solid var(--app-color-border-default); cursor:pointer; }
.prov-row:hover{ background:var(--app-color-hover-overlay); }
.settings-provider-row{ border-radius:var(--app-radius-small); margin-top:0; margin-right:6px; margin-bottom:4px; margin-left:6px; border-top:none; outline:none; }
.settings-provider-row:focus-visible{ outline:2px solid var(--app-color-focus-ring); outline-offset:-1px; background:var(--app-color-hover-overlay); }
.settings-provider-row:active{ background:var(--app-color-active-overlay); }
.prov-leading{ display:flex; align-items:center; flex-shrink:0; margin-right:12px; }
.prov-ico{ width:36px; height:36px; border-radius:var(--app-radius-medium); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-family:var(--app-font-family-mono); font-size:12px; font-weight:500; }
.prov-content{ flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; }
.prov-title-row{ display:flex; align-items:flex-start; min-width:0; }
.prov-name{ min-width:0; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:17px; font-size:13px; font-weight:500; color:var(--app-color-text-primary); }
.prov-primary-status{ flex-shrink:0; margin-top:0; margin-left:6px; }
.prov-meta-row{ display:flex; align-items:center; min-width:0; margin-top:3px; font-size:10px; color:var(--app-color-text-muted); }
.prov-model{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--app-font-family-mono); color:var(--app-color-text-secondary); }
.prov-family{ flex-shrink:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--app-font-family-mono); color:var(--app-color-text-muted); letter-spacing:.2px; }
.prov-meta-sep{ flex-shrink:0; color:var(--app-color-border-strong); margin-right:6px; margin-left:6px; }
.badge{ padding:1px 7px; border-radius:var(--app-radius-small); font-size:10px; font-weight:500; flex-shrink:0; }
.badge.active{ background:var(--app-color-positive-subtle); color:var(--app-color-positive); }
.badge.connected{ background:var(--app-color-informative-subtle); color:var(--app-color-informative); }
.badge.error{ background:var(--app-color-negative-subtle); color:var(--app-color-negative); }
.badge.none{ background:var(--app-color-hover-overlay); color:var(--app-color-text-muted); }
.prov-end{ display:flex; align-items:center; flex-shrink:0; min-width:0; margin-left:12px; }
.prov-readiness{ display:flex; align-items:center; min-width:0; flex-shrink:0; margin-right:12px; }
.prov-readiness-dot{ width:8px; height:8px; border-radius:50%; background:var(--app-color-border-default); }
.prov-readiness-dot{ margin-right:6px; }
.prov-readiness.ready .prov-readiness-dot{ background:var(--app-color-positive); }
.prov-readiness.warning .prov-readiness-dot{ background:var(--app-color-notice); }
.prov-readiness.configured .prov-readiness-dot{ background:var(--app-color-informative); }
.prov-trail{ display:flex; align-items:center; flex-shrink:0; color:var(--app-color-text-muted); }
.prov-status-text{ font-family:var(--app-font-family-mono); font-size:10px; color:var(--app-color-text-muted); flex-shrink:0; }
.settings-provider-row.is-disabled .prov-leading,
.settings-provider-row.is-disabled .prov-content{ opacity:.62; }
.settings-provider-row.is-special .prov-name{ color:var(--app-color-informative); }
.footer-info{ padding:12px 16px; border-top:1px solid var(--app-color-border-default); display:flex; align-items:center; min-width:0; }
.footer-info [data-icon]{ margin-right:8px; }
.settings-detail-layout{
  width:min(100%, 760px);
  margin-top:0;
  margin-right:auto;
  margin-bottom:0;
  margin-left:auto;
}
.section{ padding:16px; }
.section-title{ font-size:11px; font-weight:600; color:var(--app-color-text-muted); letter-spacing:.6px; margin-bottom:12px; }
.field{ margin-bottom:12px; }
.field:last-child{ margin-bottom:0; }
.field-input{ width:100%; }
.provider-endpoint-row-spaced{ margin-top:10px; }
.provider-endpoint-row{ display:block; }
.provider-endpoint-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.provider-endpoint-input{ margin-top:8px; }
.provider-endpoint-badges{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
}
.provider-endpoint-badges > *{ margin-right:6px; }
.provider-endpoint-badges > *:last-child{ margin-right:0; }
.provider-endpoint-controls{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  margin-top:8px;
}
.provider-endpoint-controls > *{ margin-right:12px; }
.provider-endpoint-controls > *:last-child{ margin-right:0; }
.provider-connection-option{ margin-top:8px; }
.provider-connection-option:first-child{ margin-top:0; }
.provider-endpoint-add{ margin-top:10px; }
.provider-model-mode-row{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  margin-top:8px;
}
.provider-model-mode-tip{
  flex:1 1 auto;
  min-width:0;
  margin-top:0;
  margin-right:12px;
}
.provider-model-mode-link{
  flex:0 0 auto;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding:0;
  border:none;
  background:transparent;
  color:var(--app-color-informative);
  font-size:11px;
  line-height:16px;
  text-align:right;
  text-decoration:underline;
  text-underline-offset:2px;
  cursor:pointer;
}
.provider-model-mode-link:hover{ color:var(--app-color-text-primary); }
.provider-model-mode-link:disabled{
  color:var(--app-color-text-muted);
  cursor:default;
  text-decoration:none;
}
.settings-select{ width:100%; min-width:0; }
.settings-select .cmp-chip-text{ width:100%; justify-content:space-between; }
.generation-settings-grid{ display:flex; align-items:stretch; min-width:0; }
.generation-settings-grid .field{ flex:1 1 0; min-width:0; margin-right:12px; }
.generation-settings-grid .field:last-child{ margin-right:0; }
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
.field-textarea-input{ margin-top:6px;
  width:100%;
  min-height:112px;
  padding:10px 12px;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-primary);
  font-family:var(--app-font-family-mono);
  font-size:12px;
  line-height:18px;
  resize:vertical;
  box-sizing:border-box;
}
.field-textarea-input::placeholder{ color:var(--app-color-text-muted); }
.field-textarea-input:focus{
  outline:2px solid var(--app-color-focus-ring);
  outline-offset:0;
  border-color:var(--app-color-focus-ring);
}
.field-hint{ margin-top:4px; }
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
}
.field-input-affordance .field-input-embedded{
  background:transparent;
  border:none;
  border-radius:0;
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
.test-area{ padding:16px; border-top:1px solid var(--app-color-border-default); display:flex; flex-direction:column; }
.test-area .ui-button-block{ width:100%; }
.test-meta{ margin-top:8px; font-family:var(--app-font-family-mono); font-size:11px; color:var(--app-color-text-muted); }
.test-area .status-notice{ margin-top:10px; }
.scroll-footer-pad{ padding-bottom:80px; }
.det-footer{ flex-shrink:0; padding:12px 16px; border-top:1px solid var(--app-color-border-default); display:flex; min-width:0; background:var(--app-color-background-base); }
.settings-detail-footer-inner{
  width:min(100%, 760px);
  margin-top:0;
  margin-right:auto;
  margin-bottom:0;
  margin-left:auto;
  display:flex;
  min-width:0;
}
.btn-save{ flex:1; }
.btn-del{ margin-left:8px; }
.btn-cancel{ margin-left:8px; }

.status-notice{
  display:flex; align-items:flex-start;
  min-height:36px; padding:6px 8px; border-radius:7px; border:1px solid var(--app-color-border-default);
  background:color-mix(in srgb, var(--app-color-background-elevated) 94%, black 6%);
  color:var(--app-color-text-secondary); box-sizing:border-box;
}
.status-notice.success,
.status-notice[data-tone="neutral"]{
  min-height:0;
  padding-top:2px;
  padding-right:0;
  padding-bottom:2px;
  padding-left:0;
  border-color:transparent;
  background:transparent;
}
.status-notice.info{ border-color:color-mix(in srgb, var(--app-color-informative) 28%, var(--app-color-border-default)); background:color-mix(in srgb, var(--app-color-background-elevated) 92%, var(--app-color-informative) 8%); }
.status-notice.warning{ border-color:color-mix(in srgb, var(--app-color-notice) 30%, var(--app-color-border-default)); background:color-mix(in srgb, var(--app-color-background-elevated) 92%, var(--app-color-notice) 8%); }
.status-notice.error{ border-color:color-mix(in srgb, var(--app-color-negative) 32%, var(--app-color-border-default)); background:color-mix(in srgb, var(--app-color-background-elevated) 91%, var(--app-color-negative) 9%); }
.status-icon{
  flex:0 0 auto; width:14px; height:14px; margin-top:2px; margin-right:8px;
  display:inline-flex; align-items:center; justify-content:center; color:var(--app-color-text-secondary);
}
.status-notice.success .status-icon{ color:var(--app-color-positive); }
.status-notice.info .status-icon{ color:var(--app-color-informative); }
.status-notice.warning .status-icon{ color:var(--app-color-notice); }
.status-notice.error .status-icon{ color:var(--app-color-negative); }
.status-message{
  flex:1;
  min-width:0; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere;
  font-family:var(--app-font-family-base); font-size:13px; line-height:18px; font-weight:500;
  color:var(--app-color-text-primary); user-select:text; -webkit-user-select:text;
}
.status-copy{
  flex-shrink:0; align-self:flex-start; margin-left:8px;
  width:24px; min-width:24px; height:24px; min-height:24px; padding:0; color:var(--app-color-text-muted);
  display:inline-flex; align-items:center; justify-content:center; opacity:.9;
  border:none; border-radius:6px; background:transparent;
}
.status-copy:hover{ background:var(--app-color-hover-overlay); opacity:1; color:var(--app-color-text-primary); }
.status-copy.cp{ color:var(--app-color-positive); }

.provider-type-row{
  display:flex;
  align-items:center;
  padding:14px 16px;
  min-height:72px;
  border-top:1px solid var(--app-color-border-default);
  cursor:pointer;
}
.provider-type-row:hover{ background:var(--app-color-hover-overlay); }
.provider-type-leading{
  display:flex;
  align-items:center;
  flex-shrink:0;
  margin-right:14px;
}
.provider-type-badge{
  width:44px;
  height:44px;
  border-radius:14px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
  font-family:var(--app-font-family-mono);
  font-size:11px;
  font-weight:600;
  letter-spacing:.3px;
}
.provider-type-content{
  flex:1;
  min-width:0;
  display:flex;
  flex-direction:column;
  justify-content:center;
}
.provider-type-name{
  min-width:0;
  font-size:13px;
  line-height:18px;
  font-weight:600;
  color:var(--app-color-text-primary);
}
.provider-type-family{
  min-width:0;
  margin-top:3px;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
  color:var(--app-color-text-muted);
  letter-spacing:.2px;
}
.provider-type-trail{
  display:flex;
  align-items:center;
  justify-content:center;
  flex:0 0 24px;
  margin-left:12px;
  color:var(--app-color-text-muted);
}
`;

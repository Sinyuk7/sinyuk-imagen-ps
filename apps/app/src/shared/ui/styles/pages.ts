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
.status-inline .row-retry{
  min-height:20px;
  padding:0 7px;
  border-radius:7px;
  font-size:9px;
  line-height:12px;
  font-weight:600;
}
	.row-icon-action{ margin-left:6px; width:24px; height:24px; min-width:24px; min-height:0; padding:0; display:flex; align-items:center; justify-content:center; color:var(--app-color-text-muted); border:none; background:transparent; }
	.row-icon-action:first-of-type{ margin-left:auto; }
.row-icon-action:hover{ color:var(--app-color-text-primary); background:var(--app-color-hover-overlay); }
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
.settings-provider-row{ border-radius:0; margin:0; outline:none; }
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
.settings-page .section{ padding:var(--settings-section-padding); }
.settings-page .section + .section{
  border-top:1px solid var(--app-color-border-default);
}
.section-title{ font-size:11px; font-weight:600; color:var(--app-color-text-secondary); letter-spacing:.3px; margin-bottom:12px; }
.settings-page .section-title{
  margin-bottom:var(--settings-field-gap);
}
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
  border-radius:var(--app-radius-small);
  color:var(--app-color-text-secondary);
}
.settings-icon-button:hover{
  color:var(--app-color-text-primary);
  background:var(--app-color-hover-overlay);
}
.settings-icon-button:active{
  background:var(--app-color-active-overlay);
}
.settings-icon-button:focus-visible{
  outline:2px solid var(--app-color-focus-ring);
  outline-offset:1px;
}
.settings-icon-button[data-disabled="true"]{
  opacity:.45;
  cursor:not-allowed;
}
.settings-icon-button.danger:hover{
  color:var(--app-color-negative);
  background:color-mix(in srgb, var(--app-color-negative) 10%, var(--app-color-hover-overlay));
}
.billing-error{
  margin-top:10px;
}
.billing-last-cost{
  margin-top:8px;
  font-size:11px;
  line-height:15px;
  color:var(--app-color-text-muted);
}
.billing-inline-heading{
  align-items:center;
  margin-bottom:10px;
}
.billing-inline-heading .section-title{
  margin-bottom:0;
}
.billing-inline-summary{
  flex:1 1 auto;
  min-width:0;
  margin-left:12px;
  font-size:12px;
  line-height:16px;
  color:var(--app-color-text-secondary);
  text-align:right;
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
.save-status{
  display:inline-flex;
  align-items:center;
  font-size:12px;
  line-height:16px;
  font-weight:600;
  color:var(--app-color-text-secondary);
}
.save-status > [data-icon]{ margin-right:6px; }
.save-status-saved{ color:var(--app-color-positive); }
.save-status-busy{ color:var(--app-color-text-muted); }
.field:last-child{ margin-bottom:0; }
.field-input{ width:100%; }
.billing-section{ display:block; }
.billing-settings-form{
  display:block;
  margin-top:14px;
  padding:12px 14px;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-medium);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--app-color-background-layer-2) 92%, transparent),
      color-mix(in srgb, var(--app-color-background-elevated) 94%, transparent)
    );
}
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
.billing-settings-grid{
  display:block;
  margin-top:12px;
}
.billing-settings-field{
  margin-bottom:0;
}
.billing-settings-field-spaced{
  margin-top:12px;
}
.billing-settings-mode-field{
  margin-bottom:0;
}
.billing-settings-hint{
  margin-top:6px;
  max-width:40ch;
  line-height:16px;
}
.billing-summary-card{
  display:flex;
  flex-direction:column;
  padding:14px 16px;
  border:1px solid color-mix(in srgb, var(--app-color-accent-default) 14%, var(--app-color-border-default));
  border-radius:var(--app-radius-medium);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--app-color-accent-subtle) 64%, transparent),
      color-mix(in srgb, var(--app-color-background-layer-2) 94%, transparent)
    );
}
.billing-summary-card-compact{
  padding:8px 12px;
}
.billing-summary-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
}
.billing-summary-header-body{
  flex:1 1 auto;
  min-width:0;
  margin-right:12px;
}
.billing-summary-actions{
  flex:0 0 auto;
}
.billing-summary-actions .ui-btn{
  width:auto;
  min-width:0;
}
.billing-summary-body{
  flex:1 1 auto;
  min-width:0;
}
.billing-summary-kicker{
  font-size:10px;
  line-height:14px;
  font-weight:700;
  letter-spacing:.04em;
  color:var(--app-color-accent-default);
}
.billing-summary-value{
  margin-top:8px;
  font-family:var(--app-font-family-mono);
  font-size:18px;
  line-height:22px;
  font-weight:600;
  color:var(--app-color-text-primary);
  overflow-wrap:anywhere;
}
.billing-summary-card-compact .billing-summary-value{
  margin-top:4px;
  font-size:14px;
  line-height:18px;
}
.billing-summary-card-compact .billing-summary-kicker{
  font-size:9px;
  line-height:13px;
}
.billing-summary-meta-list{
  display:block;
  margin-top:8px;
}
.billing-summary-card-compact .billing-summary-meta-list{
  margin-top:4px;
}
.billing-summary-meta-item{
  font-size:11px;
  line-height:16px;
  color:var(--app-color-text-muted);
}
.billing-summary-card-compact .billing-summary-meta-item{
  font-size:10px;
  line-height:14px;
}
.billing-summary-meta-item-spaced{
  margin-top:4px;
}
.billing-detail-list{
  display:block;
  margin-top:8px;
  padding-top:4px;
  border-top:1px solid color-mix(in srgb, var(--app-color-border-default) 80%, transparent);
}
.billing-detail-title{
  font-size:11px;
  line-height:16px;
  color:var(--app-color-text-muted);
}
.billing-detail-item{
  font-size:12px;
  line-height:17px;
  color:var(--app-color-text-secondary);
}
.billing-detail-item-spaced{
  margin-top:6px;
}
.provider-endpoint-row-spaced{
  margin-top:8px;
  padding-top:8px;
  border-top:1px solid var(--app-color-border-default);
}
.provider-endpoint-row{
  display:block;
  padding-top:8px;
  padding-right:10px;
  padding-bottom:8px;
  padding-left:10px;
  border:1px solid var(--app-color-border-default);
  border-radius:12px;
  background:var(--app-color-surface-raised);
}
.provider-endpoint-row-current{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-subtle);
}
.provider-endpoint-row-auto{
  cursor:default;
}
.provider-endpoint-row-draft{
  margin-top:8px;
}
.provider-endpoint-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.provider-endpoint-header > *:first-child{ margin-right:12px; }
.provider-endpoint-input{ margin-top:4px; }
.provider-endpoint-title-row{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  min-width:0;
}
.provider-endpoint-title-row > *{ margin-top:0; margin-right:6px; margin-bottom:0; margin-left:0; }
.provider-endpoint-title-row > *:last-child{ margin-right:0; }
.provider-endpoint-preferred-dot{
  width:8px;
  min-width:8px;
  height:8px;
  border-radius:50%;
  background:var(--app-color-accent-default);
  flex:0 0 auto;
}
.provider-endpoint-label{
  font-size:12px;
  line-height:16px;
  font-weight:600;
  color:var(--app-color-text-secondary);
}
.provider-endpoint-meta{
  font-size:11px;
  line-height:16px;
  color:var(--app-color-text-muted);
}
.provider-endpoint-meta-current{
  color:var(--app-color-accent-default);
}
.provider-endpoint-meta-failed{
  color:var(--app-color-negative);
}
.provider-endpoint-remove{
  width:28px;
  min-width:28px;
  height:28px;
  min-height:28px;
  color:var(--app-color-negative);
}
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
.provider-endpoint-add{
  margin-top:10px;
  width:auto;
  min-width:0;
}
.provider-endpoint-add.ui-btn{
  display:inline-flex;
}
.prompt-preset-list{
  margin-top:0;
  margin-right:0;
  margin-bottom:var(--settings-field-gap);
  margin-left:0;
  border:none;
  border-radius:0;
  overflow:visible;
  background:transparent;
}
.prompt-preset-row{
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
.prompt-preset-row:first-child{
  border-top:none;
}
.prompt-preset-row:hover{
  background:var(--app-color-hover-overlay);
}
.prompt-preset-row:active{
  background:var(--app-color-active-overlay);
}
.prompt-preset-row:focus-visible{
  outline:2px solid var(--app-color-focus-ring);
  outline-offset:-2px;
}
.prompt-preset-row.is-selected{ background:var(--app-color-accent-subtle); }
.prompt-preset-row.is-invalid{
  background:var(--app-color-negative-subtle);
}
.prompt-preset-indicator{
  position:absolute;
  top:0;
  left:0;
  bottom:0;
  width:3px;
  background:transparent;
}
.prompt-preset-indicator[data-selected="true"]{
  background:var(--app-color-accent-default);
}
.prompt-preset-row-main{
  display:flex;
  align-items:center;
  min-width:0;
  min-height:26px;
}
.prompt-preset-radio{
  width:9px;
  min-width:9px;
  height:9px;
  margin-right:6px;
  border:1px solid var(--app-color-border-strong);
  border-radius:50%;
  background:transparent;
  flex-shrink:0;
}
.prompt-preset-radio[data-selected="true"]{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-default);
}
.prompt-preset-name{
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
.prompt-preset-mode{
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
.prompt-preset-mode.is-invalid{
  color:var(--app-color-negative);
}
.prompt-preset-actions{
  display:flex;
  align-items:center;
  flex:0 0 auto;
  margin-left:2px;
}
.prompt-preset-action-host,
.prompt-preset-action-overlay{
  width:24px;
  min-width:24px;
  height:24px;
  min-height:24px;
}
.prompt-preset-action{
  width:24px;
  min-width:24px;
  height:24px;
  min-height:24px;
  margin-left:0;
  color:var(--app-color-text-muted);
  opacity:.62;
}
.prompt-preset-action:hover,
.prompt-preset-action:focus-visible{
  color:var(--app-color-text-primary);
  opacity:1;
}
.prompt-preset-action.danger{
  opacity:.48;
}
.prompt-preset-error{
  margin-top:3px;
  margin-right:0;
  margin-bottom:0;
  margin-left:16px;
}
.settings-inline-heading-row{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  margin-top:0;
  margin-right:0;
  margin-bottom:10px;
  margin-left:0;
}
.settings-inline-heading-copy{
  flex:1 1 auto;
  min-width:0;
  margin-right:12px;
}
.settings-inline-heading-actions{
  flex:0 0 auto;
}
.settings-inline-heading-actions .ui-btn{
  width:auto;
  min-width:0;
}
.provider-api-format-row{
  align-items:center;
  justify-content:flex-start;
  margin-bottom:4px;
  min-width:0;
}
.provider-api-format-row .section-title{
  flex:0 0 auto;
  margin-bottom:0;
  margin-right:12px;
}
.provider-api-format-inline{
  flex:1 1 auto;
  min-width:0;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  text-align:left;
}
.provider-embedded-section{
  display:block;
}
.provider-embedded-section + .provider-embedded-section{
  margin-top:12px;
}
.provider-endpoint-detect-field{
  margin-top:2px;
}
.provider-model-mode-row{
  display:flex;
  align-items:flex-start;
  justify-content:flex-start;
  margin-top:6px;
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
.settings-select,
.provider-model-select{ width:100%; min-width:0; }
.settings-page .settings-select .cmp-chip-text,
.settings-page .provider-model-select .cmp-chip,
.settings-page .provider-model-select .cmp-chip-text{
  min-height:30px;
}
.provider-model-select .cmp-chip{
  width:100%;
  min-height:30px;
  padding:4px 8px;
  border-color:var(--app-color-border-default);
  border-radius:var(--app-radius-small);
  background:var(--app-color-background-layer-2);
}
.provider-model-select .cmp-chip-text{
  width:100%;
  justify-content:flex-start;
  text-align:left;
}
.provider-model-select .cmp-chip-body-text{
  width:100%;
  justify-content:space-between;
}
.provider-model-select .cmp-chip-value-text{
  flex:1 1 auto;
  min-width:0;
  text-align:left;
  justify-content:flex-start;
  color:var(--app-color-text-primary);
}
.provider-model-select .cmp-chip-arrow-text{
  margin-left:8px;
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
.generation-settings-section-intro{
  margin-top:0;
  margin-right:0;
  margin-bottom:12px;
  margin-left:0;
}
.model-config-list-heading{
  margin-bottom:0;
}
.model-config-list-hint{
  margin-top:2px;
  margin-bottom:10px;
  max-width:44ch;
}
.model-config-list{
  margin-right:-14px;
  margin-left:-14px;
}
.model-config-list .settings-provider-row{
  padding-right:14px;
  padding-left:14px;
}
.generation-settings-section-hint{
  display:block;
  max-width:44ch;
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
.generation-settings-path-list .field{
  margin-bottom:12px;
}
.generation-settings-path-list .field:last-child{
  margin-bottom:0;
}
.generation-settings-path-list .settings-path-affordance{
  background:color-mix(in srgb, var(--app-color-background-layer-2) 88%, transparent);
}
.model-config-capability-section-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  margin-bottom:12px;
}
.model-config-capability-section-copy{
  flex:1 1 auto;
  min-width:0;
  margin-right:12px;
}
.model-config-capability-meta{
  flex:0 0 auto;
  font-size:11px;
  line-height:15px;
  color:var(--app-color-text-muted);
  white-space:nowrap;
}
.model-config-option-list{
  display:flex;
  align-items:stretch;
  flex-wrap:wrap;
  min-width:0;
}
.model-config-advanced-section{
  padding-top:2px;
}
.model-config-advanced-toggle{
  display:flex;
  align-items:center;
  justify-content:space-between;
  width:100%;
  margin-top:0;
  margin-right:0;
  margin-bottom:8px;
  margin-left:0;
  min-height:28px;
  padding:4px 0;
  border:none;
  border-radius:0;
  background:transparent;
  color:var(--app-color-text-secondary);
  text-align:left;
  cursor:pointer;
  appearance:none;
  -webkit-appearance:none;
  outline:none;
}
.model-config-advanced-toggle:hover{
  color:var(--app-color-text-primary);
}
.model-config-advanced-toggle:focus-visible{
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:1px;
}
.model-config-advanced-toggle-copy{
  flex:1 1 auto;
  min-width:0;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.model-config-advanced-toggle-title{
  margin-bottom:0;
}
.model-config-advanced-toggle-icon{
  flex:0 0 auto;
}
.model-config-chip{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:68px;
  min-height:26px;
  margin-top:0;
  margin-right:4px;
  margin-bottom:4px;
  margin-left:0;
  padding:3px 10px;
  border:1px solid var(--app-color-border-default);
  border-radius:7px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
  font-weight:400;
  font-family:var(--app-font-family-base);
  font-size:11px;
  line-height:16px;
  cursor:pointer;
  appearance:none;
  -webkit-appearance:none;
  outline:none;
}
.model-config-chip-label{
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:15px;
}
.model-config-chip-check{
  width:5px;
  height:5px;
  margin-top:0;
  margin-right:5px;
  margin-bottom:0;
  margin-left:0;
  border-radius:50%;
  background:currentColor;
  flex:0 0 auto;
}
.model-config-chip:hover{
  border-color:var(--app-color-border-strong);
  color:var(--app-color-text-primary);
  background:var(--app-color-hover-overlay);
}
.model-config-chip.is-selected{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-subtle);
  color:var(--app-color-accent-default);
}
.model-config-chip:focus-visible{
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:1px;
}
.model-config-chip:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.model-config-ratio-grid{
  display:flex;
  align-items:stretch;
  flex-wrap:wrap;
  min-width:0;
}
.model-config-ratio-tile{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:68px;
  min-width:68px;
  min-height:26px;
  margin-top:0;
  margin-right:4px;
  margin-bottom:4px;
  margin-left:0;
  padding:3px 8px;
  border:1px solid var(--app-color-border-default);
  border-radius:7px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
  cursor:pointer;
  appearance:none;
  -webkit-appearance:none;
  outline:none;
}
.model-config-ratio-tile:hover{
  border-color:var(--app-color-border-strong);
  background:var(--app-color-hover-overlay);
  color:var(--app-color-text-primary);
}
.model-config-ratio-tile.is-selected{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-subtle);
  color:var(--app-color-accent-default);
}
.model-config-ratio-tile:focus-visible{
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:1px;
}
.model-config-ratio-tile:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.model-config-ratio-preview{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:20px;
  height:14px;
  margin-top:0;
  margin-right:4px;
  margin-bottom:0;
  margin-left:0;
  flex:0 0 auto;
}
.model-config-ratio-preview-svg{
  display:block;
  width:20px;
  height:14px;
}
.model-config-ratio-preview-rect{
  fill:none;
  stroke:currentColor;
  stroke-width:1.25;
}
.model-config-ratio-label{
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:15px;
  font-weight:400;
  color:inherit;
  text-align:center;
}
.model-config-ratio-tile-text{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:0;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:15px;
  font-weight:400;
  color:inherit;
  text-align:center;
}
.model-config-ratio-check{
  position:static;
  width:5px;
  height:5px;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:5px;
  border-radius:50%;
  background:currentColor;
  flex:0 0 auto;
}
.model-config-size-grid{
  display:flex;
  align-items:stretch;
  flex-wrap:wrap;
  min-width:0;
}
.model-config-size-tile{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:68px;
  min-width:68px;
  min-height:26px;
  margin-top:0;
  margin-right:4px;
  margin-bottom:4px;
  margin-left:0;
  padding:3px 8px;
  border:1px solid var(--app-color-border-default);
  border-radius:7px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
  cursor:pointer;
  appearance:none;
  -webkit-appearance:none;
  outline:none;
}
.model-config-size-tile:hover{
  border-color:var(--app-color-border-strong);
  background:var(--app-color-hover-overlay);
  color:var(--app-color-text-primary);
}
.model-config-size-tile.is-selected{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-subtle);
  color:var(--app-color-accent-default);
}
.model-config-size-tile:focus-visible{
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:1px;
}
.model-config-size-tile:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.model-config-size-label{
  font-family:'SF Mono','Menlo',monospace;
  font-size:12px;
  line-height:16px;
  font-weight:400;
  letter-spacing:.08em;
  font-variant-numeric:tabular-nums lining-nums;
  font-feature-settings:"tnum" 1;
  color:inherit;
  text-align:center;
  text-transform:uppercase;
}
.model-config-combination-summary{
  display:block;
  margin-top:2px;
  font-family:'SF Mono','Menlo',monospace;
  font-size:10px;
  line-height:14px;
  letter-spacing:.06em;
  font-variant-numeric:tabular-nums lining-nums;
  font-feature-settings:"tnum" 1;
  color:var(--app-color-text-muted);
}
.model-config-meta-value{
  padding:7px 10px;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
  font-size:11px;
  line-height:16px;
  overflow-wrap:anywhere;
}
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
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
  background:var(--app-color-background-layer-2);
  box-sizing:border-box;
}
.field-textarea-shell[data-focused="true"]{
  outline:2px solid var(--app-color-focus-ring);
  outline-offset:0;
  border-color:var(--app-color-focus-ring);
}
.field-textarea-shell[data-invalid="true"]{
  border-color:var(--app-color-negative-default);
}
.field-textarea-shell[data-disabled="true"]{
  opacity:.72;
}
.field-textarea-shell[data-native-editor-suspended="true"]{
  background:color-mix(in srgb, var(--app-color-background-layer-2) 88%, transparent);
}
.field-textarea-input,
.field-textarea-native{
  width:100%;
  min-height:110px;
  padding:10px 12px;
  border:none;
  border-radius:inherit;
  background:transparent;
  color:var(--app-color-text-primary);
  font-family:var(--app-font-family-mono);
  font-size:12px;
  line-height:18px;
  resize:vertical;
  box-sizing:border-box;
  outline:none;
  appearance:none;
  -webkit-appearance:none;
}
.field-textarea-input::placeholder,
.field-textarea-native::placeholder{ color:var(--app-color-text-muted); }
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
}
.field-input-affordance .field-input-embedded{
  background:transparent;
  border:none;
  border-radius:0;
}
.model-config-model-id-shell{
  min-height:32px;
}
.model-config-model-id-shell[data-disabled="true"]{
  opacity:.72;
}
.model-config-model-id-shell[data-native-editor-suspended="true"]{
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
.test-area .status-notice{ margin-top:10px; }
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
.settings-detail-footer-actions .status-notice{
  min-height:0;
  padding:3px 6px;
  font-size:11px;
}
.settings-detail-footer-actions .status-message{
  font-size:11px;
  line-height:15px;
}
.settings-add-footer .settings-detail-footer-inner{
  align-items:flex-start;
  flex-wrap:nowrap;
}
.settings-add-footer .settings-detail-footer-inner > *{
  margin-right:0;
}
.settings-add-footer .settings-detail-footer-actions{
  flex:1 1 auto;
  flex-wrap:nowrap;
}
.settings-add-footer .settings-detail-footer-actions .status-notice{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
}
.settings-add-footer .settings-detail-footer-actions .status-body{
  min-width:0;
  overflow:hidden;
}
.settings-add-footer .settings-detail-footer-actions .status-message{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  word-break:normal;
}
.settings-add-footer .settings-add-footer-save-group{
  margin-left:10px;
}
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

.settings-path-list{
  display:flex;
  flex-direction:column;
}
.settings-path-block{
  flex:1;
  min-width:0;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  word-break:break-word;
  font-family:var(--app-font-family-mono);
  font-size:12px;
  line-height:18px;
  color:var(--app-color-text-primary);
  user-select:text;
  -webkit-user-select:text;
  padding-top:7px;
  padding-right:10px;
  padding-bottom:7px;
  padding-left:10px;
  background:transparent;
  border:none;
  border-radius:0;
  box-sizing:border-box;
}
.settings-path-affordance{ align-items:flex-start; }
.settings-path-copy{
  color:var(--app-color-text-muted);
}
.settings-path-copy.cp{ color:var(--app-color-positive); }
.generation-settings-footer{
  justify-content:flex-end;
}
.generation-settings-footer .btn-save{
  flex:0 1 240px;
  min-width:160px;
}

@media (max-width: 420px){
  .billing-summary-header,
  .settings-inline-heading-row{
    flex-direction:column;
    align-items:stretch;
  }
  .provider-api-format-row{
    flex-direction:row;
    align-items:center;
  }
  .billing-summary-header-body,
  .settings-inline-heading-copy{
    margin-right:0;
    margin-bottom:8px;
  }
  .billing-summary-actions .ui-btn,
  .settings-inline-heading-actions .ui-btn{
    width:100%;
  }
  .provider-model-mode-row{
    flex-direction:column;
    align-items:flex-start;
  }
  .provider-model-mode-tip{
    margin-right:0;
    margin-bottom:6px;
  }
  .provider-model-mode-link{
    text-align:left;
  }
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
  .settings-add-footer .settings-detail-footer-inner{
    flex-wrap:nowrap;
  }
  .settings-add-footer .settings-detail-footer-actions,
  .settings-add-footer .settings-add-footer-save-group{
    width:auto;
  }
  .settings-add-footer .settings-add-footer-save-group{
    justify-content:flex-end;
    margin-top:0;
  }
  .generation-settings-footer .btn-save{
    flex:1 1 100%;
    min-width:0;
  }
}
@media (max-width: 360px){
  .provider-endpoint-controls{
    flex-direction:column;
    align-items:flex-start;
  }
  .provider-endpoint-controls > *{
    margin-right:0;
    margin-bottom:6px;
  }
  .provider-endpoint-controls > *:last-child{
    margin-bottom:0;
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

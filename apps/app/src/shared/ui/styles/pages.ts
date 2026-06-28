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
.section{ padding:16px; }
.section-title{ font-size:11px; font-weight:600; color:var(--app-color-text-muted); letter-spacing:.6px; margin-bottom:12px; }
.field{ margin-bottom:12px; }
.field:last-child{ margin-bottom:0; }
.field-input{ width:100%; }
.field-hint{ margin-top:4px; }
.pw-wrap{ display:flex; align-items:center; }
.pw-wrap .field-input{ flex:1; }
.pw-toggle{ margin-left:6px; color:var(--app-color-text-muted); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
.test-area{ padding:16px; border-top:1px solid var(--app-color-border-default); display:flex; flex-direction:column; }
.test-area .swc-button{ width:100%; }
.test-area .status-notice{ margin-top:10px; }
.scroll-footer-pad{ padding-bottom:80px; }
.det-footer{ flex-shrink:0; padding:12px 16px; border-top:1px solid var(--app-color-border-default); display:flex; min-width:0; background:var(--app-color-background-base); }
.btn-save{ flex:1; }
.btn-del{ margin-left:8px; }
.btn-cancel{ margin-left:8px; }

.status-notice{
  display:flex; align-items:flex-start;
  padding:8px 10px; border-radius:var(--app-radius-small); border:1px solid var(--app-color-border-default);
  background:var(--app-color-background-layer-2); color:var(--app-color-text-secondary);
}
.status-notice.success{ border-color:var(--app-color-positive); background:var(--app-color-positive-subtle); color:var(--app-color-positive); }
.status-notice.warning{ border-color:var(--app-color-notice); background:var(--app-color-notice-subtle); color:var(--app-color-notice); }
.status-notice.error{ border-color:var(--app-color-negative); background:var(--app-color-negative-subtle); color:var(--app-color-negative); }
.status-message{
  flex:1;
  min-width:0; white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere;
  font-family:var(--app-font-family-mono); font-size:11px; line-height:16px; user-select:text; -webkit-user-select:text;
}
.status-copy{
  flex-shrink:0; margin-left:8px;
  width:28px; height:28px; color:currentColor;
  display:inline-flex; align-items:center; justify-content:center; opacity:.8;
}
.status-copy:hover{ background:var(--app-color-hover-overlay); opacity:1; }
.status-copy.cp{ color:var(--app-color-positive); }
`;

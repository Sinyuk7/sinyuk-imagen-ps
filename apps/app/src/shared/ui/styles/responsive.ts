/** 响应式：Panel root 写入离散 `data-*` 模式，CSS 只消费语义模式。 */
export const RESPONSIVE_CSS = `
.panel[data-panel-width-mode="compact"] .cmp-shell{ padding:8px; }
.panel[data-panel-width-mode="compact"] .composer{ padding:7px 8px 9px; }
.panel[data-panel-width-mode="compact"] .cmp-action-row{ margin-top:6px; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar{ padding-top:3px; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar{ flex-wrap:nowrap; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar-left{ flex:1 1 auto; min-width:0; max-width:none; margin-bottom:3px; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar-right{ flex:0 0 auto; justify-content:flex-end; margin-top:0; margin-right:0; margin-bottom:3px; margin-left:8px; }
.panel[data-panel-width-mode="compact"] .cmp-add{ width:28px; height:28px; }
.panel[data-panel-width-mode="compact"] .cmp-send{ width:30px; height:30px; }
.panel[data-panel-width-mode="compact"] .cmp-select-model{ flex:1 1 auto; min-width:0; }
.panel[data-panel-width-mode="compact"] .cmp-capture{ min-width:84px; height:28px; padding-left:8px; padding-right:8px; }
.panel[data-panel-width-mode="compact"] .cmp-select-aspect{ flex:0 0 auto; min-width:82px; margin-top:0; margin-right:5px; margin-bottom:0; margin-left:0; }
.panel[data-panel-width-mode="compact"] .cmp-chip{ padding:2px 6px; font-size:9px; }
.panel[data-panel-width-mode="compact"] .cmp-select-aspect .cmp-chip-leading{ display:none !important; }
.panel[data-panel-width-mode="compact"] .cmp-select-aspect .cmp-chip-value{ max-width:48px; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid{ flex-direction:column; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid .field{ margin-right:0; margin-bottom:8px; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid .field:last-child{ margin-bottom:0; }
  .panel[data-panel-width-mode="compact"] .prov-row{ padding:9px 12px; }
  .panel[data-panel-width-mode="compact"] .settings-provider-row{ margin-left:4px; margin-right:4px; }
  .panel[data-panel-width-mode="compact"] .prov-leading{ margin-right:9px; }
  .panel[data-panel-width-mode="compact"] .prov-ico{ width:32px; height:32px; }
  .panel[data-panel-width-mode="compact"] .prov-title-row{ align-items:flex-start; flex-wrap:wrap; }
  .panel[data-panel-width-mode="compact"] .prov-end{ align-self:flex-start; padding-top:2px; margin-left:8px; }
  .panel[data-panel-width-mode="compact"] .prov-readiness{ flex-direction:column; align-items:flex-end; margin-right:8px; }
  .panel[data-panel-width-mode="compact"] .prov-readiness-dot{ margin-right:0; margin-bottom:3px; }
  .panel[data-panel-width-mode="compact"] .prov-status-text{ max-width:62px; text-align:right; white-space:normal; line-height:12px; }
  .panel[data-panel-width-mode="compact"] .prov-family{ max-width:86px; }
    .panel[data-panel-width-mode="compact"] .prov-top{ align-items:flex-start; flex-wrap:wrap; }
    .panel[data-panel-width-mode="compact"] .prov-status{ margin-top:4px; margin-left:auto; }
    .panel[data-panel-width-mode="compact"] .prov-actions{ flex-wrap:wrap; padding-top:4px; padding-bottom:4px; }
.panel[data-panel-width-mode="compact"] .img-meta{ max-width:calc(100% - 16px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.panel[data-panel-width-mode="compact"] .err-actions{ flex-wrap:wrap; }
.panel[data-panel-width-mode="compact"] .err-copy{ margin-top:6px; margin-left:0; }
.panel[data-panel-width-mode="compact"] .model-menu{ left:12px; right:12px; }
.panel[data-panel-width-mode="compact"] .ui-toast[data-testid="toast"]{ left:12px; right:12px; width:auto; max-width:none; }
.panel[data-panel-width-mode="compact"] .attach-picker,
.panel[data-panel-width-mode="compact"] .layer-list-wrap{ left:12px; right:12px; width:auto; max-width:none; }

.panel[data-panel-width-mode="wide"] .img-result{ max-height:320px; }
.panel[data-panel-width-mode="wide"] .img-bg{ max-height:320px; }
.panel[data-panel-width-mode="wide"] .user-wrap{ max-width:min(74%, 72ch); }
.panel[data-panel-width-mode="wide"] .cmp-select-aspect .cmp-chip-value{ max-width:none; }

.panel[data-panel-height-mode="short"] .composer{ max-height:min(48%, 210px); padding-top:6px; padding-bottom:8px; }
.panel[data-panel-height-mode="short"] .cmp-ta{ max-height:54px; }
.panel[data-panel-height-mode="short"] .cmp-toolbar{ padding-top:6px; }
.panel[data-panel-height-mode="short"] .attach-picker,
.panel[data-panel-height-mode="short"] .layer-list-wrap{ max-height:180px; }
.panel[data-panel-height-mode="short"] .layer-scroll{ max-height:136px; }
.panel[data-panel-height-mode="short"] .settings-page .section{ padding:12px; }
.panel[data-panel-height-mode="short"] .settings-page .field{ margin-bottom:10px; }
.panel[data-panel-height-mode="short"] .settings-page .test-area{ padding:12px; }
.panel[data-panel-height-mode="short"] .settings-page .det-footer{ padding:8px 12px; }
.panel[data-panel-height-mode="short"] .settings-page .scroll-footer-pad{ padding-bottom:96px; }

.cmp-select-aspect .cmp-chip-value{ max-width:none; }
`;

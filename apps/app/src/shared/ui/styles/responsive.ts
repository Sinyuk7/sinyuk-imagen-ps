/** 响应式：Panel root 写入离散 `data-*` 模式，CSS 只消费语义模式。 */
export const RESPONSIVE_CSS = `
.panel[data-panel-width-mode="compact"] .cmp-shell{ padding:8px; }
.panel[data-panel-width-mode="compact"] .composer{ padding:7px 8px 9px; }
.panel[data-panel-width-mode="compact"] .cmp-action-row{ margin-top:6px; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar{ padding-top:3px; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar{ flex-wrap:nowrap; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar-left{ flex:1 1 auto; min-width:0; max-width:none; margin-bottom:3px; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar-right{ flex:0 0 auto; justify-content:flex-end; margin-top:0; margin-right:0; margin-bottom:3px; margin-left:8px; }
.panel[data-panel-width-mode="compact"] .cmp-balance-pill{ max-width:144px; padding:0 8px; }
.panel[data-panel-width-mode="compact"] .cmp-balance-pill-primary,
.panel[data-panel-width-mode="compact"] .cmp-balance-pill-unit,
.panel[data-panel-width-mode="compact"] .cmp-balance-pill-secondary{ font-size:9px; line-height:12px; }
.panel[data-panel-width-mode="compact"] .cmp-add{ width:28px; height:28px; }
.panel[data-panel-width-mode="compact"] .cmp-send{ width:30px; height:30px; }
.panel[data-panel-width-mode="compact"] .cmp-select-model{ flex:1 1 auto; min-width:0; }
.panel[data-panel-width-mode="compact"] .cmp-capture{ width:28px; height:28px; }
.panel[data-panel-width-mode="compact"] .cmp-select-output-size{ flex:0 0 auto; min-width:52px; margin-top:0; margin-right:3px; margin-bottom:0; margin-left:0; }
.panel[data-panel-width-mode="compact"] .cmp-chip-icon,
.panel[data-panel-width-mode="compact"] .cmp-chip-text{ padding:2px 6px; font-size:9px; }
.panel[data-panel-width-mode="compact"] .cmp-select-model .cmp-chip-icon{
  padding-top:2px;
  padding-right:32px;
  padding-bottom:2px;
  padding-left:36px;
}
.panel[data-panel-width-mode="compact"] .cmp-select-output-size .cmp-chip-leading-icon{ display:none !important; }
.panel[data-panel-width-mode="compact"] .cmp-select-output-size .cmp-chip-value-icon{ max-width:40px; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid{ flex-direction:column; flex-wrap:nowrap; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid .field{ margin-right:0; margin-bottom:8px; flex:1 1 auto; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid .field:last-child{ margin-bottom:0; }
.panel[data-panel-width-mode="compact"] .billing-settings-form{ padding:12px; }
.panel[data-panel-width-mode="compact"] .billing-summary-card{ padding:12px; }
.panel[data-panel-width-mode="compact"] .billing-summary-value{ font-size:16px; line-height:20px; }
  .panel[data-panel-width-mode="compact"] .prov-row{ padding:8px 12px; }
  .panel[data-panel-width-mode="compact"] .prov-leading{ margin-right:9px; }
  .panel[data-panel-width-mode="compact"] .prov-ico{ width:32px; height:32px; }
  .panel[data-panel-width-mode="compact"] .prov-title-row{ align-items:flex-start; flex-wrap:wrap; }
  .panel[data-panel-width-mode="compact"] .prov-end{ align-self:flex-start; padding-top:2px; margin-left:8px; }
  .panel[data-panel-width-mode="compact"] .prov-readiness{ flex-direction:column; align-items:flex-end; margin-right:8px; }
  .panel[data-panel-width-mode="compact"] .prov-readiness-dot{ margin-right:0; margin-bottom:3px; }
  .panel[data-panel-width-mode="compact"] .prov-status-text{ max-width:62px; text-align:right; white-space:normal; line-height:12px; }
  .panel[data-panel-width-mode="compact"] .prov-family{ max-width:86px; }
  .panel[data-panel-width-mode="compact"] .round-list{
    --chat-prompt-inline-max:100%;
    --chat-result-inline-max:100%;
    --chat-preview-inline-max:100%;
    --chat-preview-block-fallback:232px;
  }
    .panel[data-panel-width-mode="compact"] .prov-top{ align-items:flex-start; flex-direction:column; }
    .panel[data-panel-width-mode="compact"] .prov-identity{ width:100%; max-width:100%; margin-right:0; margin-bottom:5px; }
    .panel[data-panel-width-mode="compact"] .prov-name-wrap{ flex-wrap:wrap; }
    .panel[data-panel-width-mode="compact"] .prov-model-lbl{ margin-left:0; width:100%; }
    .panel[data-panel-width-mode="compact"] .prov-status{ margin-top:0; margin-right:0; margin-bottom:0; margin-left:25px; padding-left:0; }
    .panel[data-panel-width-mode="compact"] .prov-top .prov-status-text{ max-width:none; text-align:left; white-space:normal; line-height:12px; }
    .panel[data-panel-width-mode="compact"] .prov-actions{ flex-wrap:wrap; padding-top:6px; padding-bottom:6px; }
.panel[data-panel-width-mode="compact"] .img-meta{ max-width:calc(100% - 16px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.panel[data-panel-width-mode="compact"] .err-request-row{ align-items:flex-start; }
.panel[data-panel-width-mode="compact"] .err-copy{ margin-top:0; margin-left:8px; }
.panel[data-panel-width-mode="compact"] .model-menu{ left:12px; right:12px; }
.panel[data-panel-width-mode="compact"] .ui-toast[data-testid="toast"]{ left:12px; right:12px; width:auto; min-width:0; max-width:none; }
.panel[data-panel-width-mode="compact"] .attach-picker,
.panel[data-panel-width-mode="compact"] .layer-list-wrap{ left:12px; right:12px; width:auto; max-width:none; }

.panel[data-panel-width-mode="regular"] .round-list{
  --chat-prompt-inline-max:272px;
  --chat-result-inline-max:320px;
  --chat-preview-inline-max:288px;
  --chat-preview-block-fallback:232px;
}
.panel[data-panel-width-mode="wide"] .round-list{
  --chat-prompt-inline-max:360px;
  --chat-result-inline-max:440px;
  --chat-preview-inline-max:360px;
  --chat-preview-block-fallback:248px;
}
.panel[data-panel-width-mode="wide"] .cmp-select-output-size .cmp-chip-value-icon{ max-width:none; }

.panel[data-panel-height-mode="short"] .composer{ max-height:min(48%, 210px); padding-top:6px; padding-bottom:8px; }
.panel[data-panel-height-mode="short"] .cmp-ta{ max-height:66px; }
.panel[data-panel-height-mode="short"] .cmp-toolbar{ padding-top:4px; }
.panel[data-panel-height-mode="short"] .attach-picker,
.panel[data-panel-height-mode="short"] .layer-list-wrap{ max-height:180px; }
.panel[data-panel-height-mode="short"] .layer-scroll{ max-height:136px; }
.panel[data-panel-height-mode="short"] .settings-page .section{ padding:12px; }
.panel[data-panel-height-mode="short"] .settings-page .field{ margin-bottom:10px; }
.panel[data-panel-height-mode="short"] .settings-page .test-area{ padding:12px; }
.panel[data-panel-height-mode="short"] .settings-page .det-footer{ padding:8px 12px; }
.panel[data-panel-height-mode="short"] .settings-page .scroll-footer-pad{ padding-bottom:96px; }
.panel[data-panel-height-mode="short"] .settings-page .scroll-footer-pad-detail{ padding-bottom:16px; }

.panel[data-panel-width-mode="compact"] .settings-add-footer .settings-detail-footer-inner{
  flex-wrap:nowrap;
}
.panel[data-panel-width-mode="compact"] .settings-add-footer .settings-detail-footer-actions,
.panel[data-panel-width-mode="compact"] .settings-add-footer .settings-add-footer-save-group{
  width:auto;
}
.panel[data-panel-width-mode="compact"] .settings-add-footer .settings-add-footer-save-group{
  justify-content:flex-end;
  margin-top:0;
}
.panel[data-panel-width-mode="compact"] .settings-add-footer .btn-save{
  flex:0 0 auto;
  min-width:72px;
}

.cmp-select-output-size .cmp-chip-value-icon{ max-width:none; }
`;

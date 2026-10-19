/** 响应式：Panel root 写入离散 `data-*` 模式，CSS 只消费语义模式。 */
export const RESPONSIVE_CSS = `
.panel[data-panel-width-mode="compact"] .cmp-shell{ padding:8px; }
.panel[data-panel-width-mode="compact"] .composer{ padding:7px 8px 9px; }
.panel[data-panel-width-mode="compact"] .cmp-action-row{ margin-top:6px; }
.panel[data-panel-width-mode="compact"] .cmp-toolbar{ padding-top:3px; }
.panel[data-panel-width-mode="compact"] .cmp-parameter-row > .cmp-parameter-field{ margin-right:4px; }
.panel[data-panel-width-mode="compact"] .cmp-model-row{ width:100%; }
.panel[data-panel-width-mode="compact"] .cmp-secondary-row{ margin-top:4px; flex-wrap:wrap; }
.panel[data-panel-width-mode="compact"] .cmp-prompt-slot{ flex:1 1 100%; margin-right:0; margin-bottom:4px; }
.panel[data-panel-width-mode="compact"] .cmp-ratio-slot,.panel[data-panel-width-mode="compact"] .cmp-size-slot{ flex:1 1 34%; }
.panel[data-panel-width-mode="compact"] .cmp-advanced-toggle{ min-height:26px; font-size:9px; }
.panel[data-panel-width-mode="compact"] .cmp-add{ width:28px; height:28px; }
.panel[data-panel-width-mode="compact"] .cmp-send{ width:30px; height:30px; }
.panel[data-panel-width-mode="compact"] .cmp-select-model{ flex:1 1 auto; min-width:0; }
.panel[data-panel-width-mode="compact"] .cmp-capture{ width:28px; height:28px; }
.panel[data-panel-width-mode="compact"] .cmp-parameter-row .cmp-chip-text{ padding:2px 6px; font-size:9px; }
.panel[data-panel-width-mode="compact"] .cmp-parameter-label{ margin-right:3px; font-size:8px; }
.panel[data-panel-width-mode="compact"] .cmp-chip-icon,
.panel[data-panel-width-mode="compact"] .cmp-chip-text{ padding:2px 6px; font-size:9px; }
.panel[data-panel-width-mode="compact"] .cmp-summary-model{ font-size:9px; }
.panel[data-panel-width-mode="compact"] .cmp-summary-detail{ font-size:8px; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid{ flex-direction:column; flex-wrap:nowrap; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid .field{ margin-right:0; margin-bottom:8px; flex:1 1 auto; }
.panel[data-panel-width-mode="compact"] .generation-settings-grid .field:last-child{ margin-bottom:0; }
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
    .panel[data-panel-width-mode="compact"] .prov-top{ display:flex; align-items:flex-start; justify-content:flex-start; }
    .panel[data-panel-width-mode="compact"] .prov-identity{ width:auto; max-width:100%; margin-right:8px; margin-bottom:0; min-width:0; flex:1 1 auto; }
    .panel[data-panel-width-mode="compact"] .prov-identity-button{ min-width:0; }
    .panel[data-panel-width-mode="compact"] .prov-name-lbl{ display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .panel[data-panel-width-mode="compact"] .prov-model-lbl{ width:100%; }
    .panel[data-panel-width-mode="compact"] .prov-model-sep{ display:none; }
    .panel[data-panel-width-mode="compact"] .prov-status{ margin:0; padding-left:0; align-self:flex-start; }
    .panel[data-panel-width-mode="compact"] .prov-top .prov-status-text{ max-width:none; text-align:right; white-space:nowrap; line-height:18px; }
    .panel[data-panel-width-mode="compact"] .prov-media-meta-row{ flex-direction:column; align-items:flex-start; flex-wrap:nowrap; }
    .panel[data-panel-width-mode="compact"] .prov-media-model-name{ width:100%; max-width:100%; margin-right:0; }
    .panel[data-panel-width-mode="compact"] .prov-media-status-group{ margin-bottom:0; }
    .panel[data-panel-width-mode="compact"] .prov-media-status-group .prov-status-text{ max-width:none; text-align:left; white-space:nowrap; line-height:14px; }
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
.panel[data-panel-width-mode="regular"] .cmp-model-row{ width:100%; }
.panel[data-panel-width-mode="regular"] .cmp-prompt-slot{ flex-basis:36%; }
.panel[data-panel-width-mode="regular"] .cmp-ratio-slot,.panel[data-panel-width-mode="regular"] .cmp-size-slot{ flex-basis:21%; }
.panel[data-panel-width-mode="wide"] .round-list{
  --chat-prompt-inline-max:360px;
  --chat-result-inline-max:440px;
  --chat-preview-inline-max:360px;
  --chat-preview-block-fallback:248px;
}
.panel[data-panel-width-mode="wide"] .cmp-parameter-row > .cmp-parameter-field{ margin-right:8px; }
.panel[data-panel-width-mode="wide"] .cmp-model-row{ width:100%; }
.panel[data-panel-width-mode="wide"] .cmp-prompt-slot{ flex-basis:42%; }
.panel[data-panel-width-mode="wide"] .cmp-ratio-slot,.panel[data-panel-width-mode="wide"] .cmp-size-slot{ flex-basis:20%; }
.panel[data-panel-width-mode="wide"] .cmp-summary-model{ font-size:10px; }

.panel[data-panel-height-mode="short"] .composer{ max-height:min(75%, 330px); padding-top:6px; padding-bottom:8px; }
.panel[data-panel-height-mode="short"] .cmp-ta{ min-height:0; }
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

`;

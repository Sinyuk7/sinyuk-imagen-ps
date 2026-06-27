/** 响应式：Panel 级粗粒度 media query。
 * 组件级语义布局变化由 ComposerSelect 内部 ResizeObserver 处理，
 * 不在此处为每个像素写规则。 */
export const RESPONSIVE_CSS = `
@media (max-width:360px){
  .cmp-core{ padding:8px; }
  .composer{ padding:7px 8px 9px; }
  .cmp-action-row{ margin-top:6px; }
  .cmp-toolbar{ padding-top:3px; }
  .cmp-toolbar-left{ margin-right:0; margin-bottom:3px; }
  .cmp-toolbar-right{ margin-bottom:3px; }
  .cmp-add,
  .cmp-opt{ width:28px; height:28px; }
  .cmp-send{ width:30px; height:30px; }
  .cmp-select-model{ flex:1 1 100%; min-width:0; }
  .cmp-toolbar-left{ flex:1 1 100%; }
  .cmp-toolbar-right{ flex:1 1 100%; justify-content:space-between; }
  .cmp-select-target{ flex:1 1 0; }
  .cmp-select-aspect{ flex:1 1 0; }
  .cmp-chip{ padding:2px 6px; font-size:9px; }
  .cmp-select-target .cmp-chip [data-icon-name="ps-layers"],
  .cmp-select-target .cmp-chip [data-icon-name="selection"],
  .cmp-select-aspect .cmp-chip [data-icon-name="image-auto-mode"]{ display:none !important; }
}

@media (max-width:320px){
  .cmp-select-model{ min-width:0; }
  .cmp-select-target{ flex-basis:0; }
  .cmp-select-aspect{ flex-basis:0; }
  .cmp-chip{ padding:2px 5px; }
  .cmp-select-target .cmp-chip-value,
  .cmp-select-aspect .cmp-chip-value{ max-width:56px; }
}

@media (max-height:440px){
  .composer{ max-height:min(48%, 210px); padding-top:6px; padding-bottom:8px; }
  .cmp-ta{ max-height:54px; }
  .cmp-toolbar{ padding-top:3px; }
  .attach-picker,
  .layer-list-wrap{ max-height:calc(100vh - 104px); }
  .layer-scroll{ max-height:min(190px, calc(100vh - 184px)); }
  .settings-page .section{ padding:12px; }
  .settings-page .field{ margin-bottom:10px; }
  .settings-page .test-area{ padding:12px; }
  .settings-page .det-footer{ padding:8px 12px; }
  .settings-page .scroll-footer-pad{ padding-bottom:96px; }
  .settings-page .chip{ margin-right:6px; margin-bottom:6px; }
}

@media (max-width:320px){
  .prov-row{ padding:9px 12px; }
  .prov-ico{ width:32px; height:32px; margin-right:9px; }
  .prov-meta .completeness{ display:none; }
}

/* Narrow panel guards */
.cmp-select-target .cmp-chip-value{ max-width:48px; }
.cmp-select-aspect .cmp-chip-value{ max-width:56px; }
`;

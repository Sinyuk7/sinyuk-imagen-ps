export const NATIVE_CONTROLS_CSS = `
.panel{
  display:block;
  width:100%;
  height:100%;
  min-width:0;
  min-height:0;
}
.ui-field-control{
  display:block;
  width:100%;
}
.ui-textfield{
  display:block;
  width:100%;
}
.ui-textfield.mono,
.field-input.mono,
.mono{
  font-family:var(--app-font-family-mono);
}
.ui-field-label{
  display:block;
  margin-bottom:6px;
  font-size:11px;
  font-weight:600;
  color:var(--app-color-text-secondary);
}
.ui-field-label[data-disabled="true"]{ opacity:.45; }
.ui-field-label[data-required="true"] span::after{
  content:"*";
  margin-left:3px;
  color:var(--app-color-negative);
}
.ui-help-text{
  display:block;
  font-size:11px;
  line-height:15px;
  color:var(--app-color-text-muted);
}
.ui-help-text[data-variant="negative"]{ color:var(--app-color-negative); }
.ui-checkbox,
.ui-radio{
  display:inline-flex;
  align-items:center;
  min-height:24px;
  min-width:0;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
  color:var(--app-color-text-primary);
  cursor:pointer;
}
.ui-checkbox > sp-checkbox,
.ui-radio > sp-radio,
.ui-choice-fallback{
  flex:0 0 auto;
  width:16px;
  min-width:16px;
  height:16px;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.ui-choice-fallback{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--app-color-border-default);
  border-radius:3px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-primary);
}
.ui-choice-fallback[aria-checked="true"]{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-subtle);
}
.ui-choice-fallback[aria-disabled="true"]{ opacity:.45; cursor:not-allowed; }
.ui-checkbox-label{
  display:block;
  min-width:0;
  font-size:12px;
  line-height:16px;
  color:var(--app-color-text-primary);
}
.ui-checkbox[data-disabled="true"] .ui-checkbox-label,
.ui-radio[data-disabled="true"] .ui-checkbox-label{
  opacity:.45;
}
.ui-divider{
  display:block;
  width:100%;
  height:1px;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding:0;
  border:none;
  background:var(--app-color-border-default);
}
.ui-divider[data-orientation="vertical"]{
  width:1px;
  height:auto;
  align-self:stretch;
}
.ui-button-block{
  width:100%;
}
.ui-btn,
.ui-action-button{
  position:relative;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:0;
}
.ui-overlay-icon-host{
  position:relative;
  display:inline-flex;
  min-width:0;
  flex:0 0 auto;
}
.ui-overlay-icon-button{
  position:relative;
  z-index:1;
}
.ui-overlay-icon-layer{
  position:absolute;
  top:0;
  left:0;
  right:0;
  bottom:0;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color:inherit;
  pointer-events:none;
  z-index:2;
}
.ui-overlay-icon-host[data-disabled="true"] > .ui-overlay-icon-layer{
  opacity:.45;
}

/* IconButton：统一图标 overlay 与占位布局。 */
.ui-icon-button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.ui-icon-button-host{
  color:inherit;
}
.ui-icon-button-host--compact-square{
  width:32px;
  min-width:32px;
  height:32px;
  min-height:32px;
}
.ui-icon-button-overlay{
  display:inline-flex;
  align-items:center;
  color:inherit;
}
.ui-icon-button-overlay--compact-square{
  width:32px;
  min-width:32px;
  height:32px;
  min-height:32px;
  justify-content:center;
}
.ui-icon-button-icon-slot{
  display:block;
  width:var(--ui-icon-button-size, 14px);
  min-width:var(--ui-icon-button-size, 14px);
  height:var(--ui-icon-button-size, 14px);
  flex:0 0 auto;
}
.ui-icon-button-label{
  display:block;
  margin-left:6px;
  font-size:10px;
  line-height:14px;
  white-space:nowrap;
}
.ui-icon-button--text-only .ui-icon-button-label{
  margin-left:0;
}
.ui-icon-button--icon-end .ui-icon-button-label{
  margin-left:0;
  margin-right:6px;
}
.ui-icon-button--icon-only .ui-icon-button-overlay{
  justify-content:center;
  padding:0;
}
.ui-icon-button--compact-square{
  width:32px;
  min-width:32px;
  height:32px;
  min-height:32px;
  padding:0;
}
.ui-icon-button--labeled .ui-icon-button-overlay{
  justify-content:flex-start;
}
.ui-button-content{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:100%;
}
.ui-button-label{
  display:block;
}
.ui-icon-text{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  white-space:nowrap;
}
.ui-icon-text-icon{
  display:block;
  flex:0 0 auto;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.ui-icon-text-label{
  display:block;
}

.settings-page .ui-field-label{
  margin-bottom:4px;
  font-size:11px;
  line-height:15px;
  font-weight:600;
  color:var(--app-color-text-secondary);
}
.settings-page .ui-help-text{
  font-size:10px;
  line-height:14px;
}
.settings-page .ui-textfield{
  font-size:12px;
}
.settings-page .ui-btn{
  font-size:12px;
}
.settings-page .ui-btn.settings-action-compact{
  font-size:11px;
}
.settings-page .ui-checkbox-label{
  font-size:11px;
  line-height:15px;
  color:var(--app-color-text-primary);
}
`;

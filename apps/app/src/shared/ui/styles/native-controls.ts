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
  min-height:32px;
  padding:6px 10px;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-small);
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-primary);
  outline:none;
}
.ui-textfield::placeholder{ color:var(--app-color-text-muted); }
.ui-textfield:focus{
  border-color:var(--app-color-focus-ring);
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:-1px;
}
.ui-textfield:disabled{
  opacity:.45;
  cursor:not-allowed;
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
  min-width:0;
  color:var(--app-color-text-primary);
  cursor:pointer;
}
.ui-checkbox input,
.ui-radio input{
  flex:0 0 auto;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.ui-checkbox-label{
  display:block;
  min-width:0;
  font-size:12px;
  line-height:16px;
  color:var(--app-color-text-primary);
}
.ui-checkbox input:disabled + .ui-checkbox-label,
.ui-radio input:disabled + .ui-checkbox-label{
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
  min-height:32px;
  padding:6px 12px;
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-medium);
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-primary);
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:0;
}
.ui-btn:hover,
.ui-action-button:hover{
  border-color:var(--app-color-border-strong);
  background:var(--app-color-background-elevated);
}
.ui-btn:active,
.ui-action-button:active{ background:var(--app-color-active-overlay); }
.ui-btn:focus-visible,
.ui-action-button:focus-visible{
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:1px;
}
.ui-btn:disabled,
.ui-action-button:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.ui-btn[data-variant="accent"]{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-default);
  color:var(--app-color-text-on-accent);
}
.ui-btn[data-variant="accent"]:hover{ background:var(--app-color-accent-hover); }
.ui-btn[data-variant="accent"]:active{ background:var(--app-color-accent-down); }
.ui-btn[data-variant="negative"]{
  border-color:var(--app-color-negative);
  color:var(--app-color-negative);
}
.ui-btn[data-variant="primary"]{
  border-color:var(--app-color-accent-default);
  color:var(--app-color-accent-default);
}
.ui-action-button[data-quiet="true"]{
  border-color:transparent;
  background:transparent;
}
.ui-action-button[data-quiet="true"]:hover{
  border-color:transparent;
  background:var(--app-color-hover-overlay);
}
.ui-action-button[data-selected="true"]{
  border-color:var(--app-color-accent-default);
  background:var(--app-color-accent-subtle);
  color:var(--app-color-accent-default);
}
.ui-action-button[data-emphasized="true"]{
  border-color:var(--app-color-accent-default);
  color:var(--app-color-accent-default);
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
  position:relative;
  top:1px;
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
  min-height:30px;
  padding:5px 10px;
  font-size:12px;
}
.settings-page .ui-btn{
  min-height:30px;
  padding:5px 10px;
  font-size:12px;
}
.settings-page .ui-btn.settings-action-compact{
  min-height:26px;
  padding:3px 8px;
  border-radius:var(--app-radius-small);
  font-size:11px;
}
.settings-page .ui-checkbox-label{
  font-size:11px;
  line-height:15px;
  color:var(--app-color-text-primary);
}
.settings-page .ui-btn.settings-action-emphasis{
  border-color:color-mix(in srgb, var(--app-color-accent-default) 42%, var(--app-color-border-default));
  background:color-mix(in srgb, var(--app-color-accent-subtle) 62%, var(--app-color-background-layer-2));
  color:var(--app-color-text-primary);
}
.settings-page .ui-btn.settings-action-emphasis:hover{
  border-color:var(--app-color-accent-default);
  background:color-mix(in srgb, var(--app-color-accent-subtle) 80%, var(--app-color-background-elevated));
}
`;

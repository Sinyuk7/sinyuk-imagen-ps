/** App shell / page / header / scroll 容器布局。 */
export const SHELL_CSS = `
.panel{
  --app-header-height:48px;
  width:100%; height:100%; background:var(--app-color-background-base); color:var(--app-color-text-primary);
  font-size:14px; line-height:20px; overflow:hidden;
  display:flex; flex-direction:column; position:relative; min-width:0; min-height:0;
  border-radius:4px;
}
.motion-page-frame{ position:absolute; top:0; right:0; bottom:0; left:0; min-width:0; min-height:0; }

/* Pages */
.page{ --app-header-height:48px; position:absolute; top:0; right:0; bottom:0; left:0; display:flex; flex-direction:column; background:var(--app-color-background-base); min-width:0; min-height:0; overflow:hidden; }

/* Header */
.hdr{
  height:48px; background:var(--app-color-background-layer-1); border-bottom:1px solid var(--app-color-border-default);
  display:flex; align-items:center; padding:0 12px; flex-shrink:0; z-index:10;
}
.hdr-btn{
  display:inline-flex; align-items:center; justify-content:center;
  width:32px; min-width:32px; height:32px;
  padding:0;
  color:var(--app-color-text-secondary); flex-shrink:0;
  box-sizing:border-box;
  min-height:0; border:none; background:transparent;
  line-height:0;
}
.hdr-btn-danger{ color:var(--app-color-negative); }
.hdr-center-wrap{
  flex:1; min-width:0; display:flex; justify-content:center; align-items:center; position:relative;
  margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px;
}
.hdr-center{
  min-width:0; max-width:min(100%, 320px); display:inline-flex; align-items:center; justify-content:center;
  min-height:30px; padding:4px 12px; border-radius:var(--app-radius-large); border:1px solid var(--app-color-border-default); background:var(--app-color-background-layer-2); color:var(--app-color-text-primary); cursor:pointer; outline:none;
  overflow:hidden;
}
.hdr-center .ui-icon-button-label{ max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--app-font-family-mono); font-size:10px; font-weight:600; color:inherit; letter-spacing:.4px; }
.hdr-provider-trigger:hover{ border-color:var(--app-color-border-strong); background:var(--app-color-background-elevated); color:var(--app-color-text-primary); }
.hdr-provider-trigger.open{ border-color:var(--app-color-accent-default); background:var(--app-color-accent-subtle); color:var(--app-color-accent-default); }
.hdr-provider-trigger:hover .ui-icon-button-label,
.hdr-provider-trigger.open .ui-icon-button-label{ color:inherit; }
.hdr-title{ flex:1; min-width:0; margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; font-family:var(--app-font-family-base); font-size:14px; font-weight:600; color:var(--app-color-text-primary); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Scroll */
.scroll{ overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--app-color-border-default) transparent; flex:1; min-width:0; min-height:0; }
.scroll::-webkit-scrollbar{ width:3px; }
.scroll::-webkit-scrollbar-thumb{ background:var(--app-color-border-default); border-radius:2px; }
.round-list{ padding:12px 12px 12px; display:flex; flex-direction:column; min-width:0; min-height:100%; }
`;

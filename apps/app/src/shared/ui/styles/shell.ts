/** App shell / page / header / scroll 容器布局。 */
export const SHELL_CSS = `
.panel{
  width:100%; height:100%; background:var(--app-color-background-base); color:var(--app-color-text-primary);
  font-size:14px; line-height:20px; overflow:hidden;
  display:flex; flex-direction:column; position:relative;
  border-radius:4px;
}

/* Pages */
.page{ position:absolute; top:0; right:0; bottom:0; left:0; display:flex; flex-direction:column; background:var(--app-color-background-base); }

/* Header */
.hdr{
  height:48px; background:var(--app-color-background-layer-1); border-bottom:1px solid var(--app-color-border-default);
  display:flex; align-items:center; padding:0 12px; flex-shrink:0; z-index:10;
}
.hdr-btn{
  display:inline-flex; align-items:center; justify-content:center;
  color:var(--app-color-text-secondary); flex-shrink:0;
}
.hdr-center{
  flex:1; min-width:0; display:flex; flex-direction:column; align-items:center;
  margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; padding:0; border:none; background:transparent; color:inherit; cursor:pointer; outline:none;
  overflow:hidden;
}
.hdr-center > span:first-child{ max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hdr-provider{ font-family:var(--app-font-family-mono); font-size:10px; color:var(--app-color-text-muted); letter-spacing:.4px; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
.hdr-title{ flex:1; min-width:0; margin-top:0; margin-right:8px; margin-bottom:0; margin-left:8px; font-family:var(--app-font-family-base); font-size:14px; font-weight:600; color:var(--app-color-text-primary); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Scroll */
.scroll{ overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--app-color-border-default) transparent; flex:1; min-height:0; }
.scroll::-webkit-scrollbar{ width:3px; }
.scroll::-webkit-scrollbar-thumb{ background:var(--app-color-border-default); border-radius:2px; }
.round-list{ padding:12px 12px 4px; display:flex; flex-direction:column; min-height:100%; }
`;

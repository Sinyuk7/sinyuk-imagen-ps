/** 浮层：Toast、Back-to-bottom。 */
export const OVERLAYS_CSS = `
/* Toast */
.ui-toast[data-testid="toast"]{
  position:absolute; top:calc(var(--app-header-height, 48px) + 10px); right:12px; left:auto; bottom:auto; z-index:2000;
  max-width:calc(100% - 48px); max-height:calc(100% - 48px); overflow-y:auto; pointer-events:auto;
  display:flex; align-items:center; min-width:160px;
  padding:9px 10px; border:1px solid var(--app-color-border-default); border-radius:var(--app-radius-medium);
  background:var(--app-color-background-elevated); color:var(--app-color-text-primary);
  font-size:12px; line-height:16px;
}
.ui-toast[data-variant="positive"]{ border-color:var(--app-color-positive); background:var(--app-color-positive-subtle); color:var(--app-color-positive); }
.ui-toast[data-variant="negative"]{ border-color:var(--app-color-negative); background:var(--app-color-negative-subtle); color:var(--app-color-negative); }
.ui-toast[data-variant="info"]{ border-color:var(--app-color-informative); background:var(--app-color-informative-subtle); color:var(--app-color-informative); }
.ui-toast[data-motion-state="exiting"]{ pointer-events:none; }
.ui-toast-message{ flex:1; min-width:0; overflow-wrap:anywhere; }
.ui-toast-close{
  flex:0 0 auto; width:20px; height:20px; margin-left:8px; border-radius:50%;
  color:currentColor; cursor:pointer; display:flex; align-items:center; justify-content:center;
}

/* Back to bottom */
.back-to-bottom{
  position:absolute; right:12px; bottom:calc(100% + 12px);
  width:32px; height:32px; min-height:0; padding:0; border-radius:50%;
  background:var(--app-color-background-layer-2); border:1px solid var(--app-color-border-default);
  color:var(--app-color-text-secondary); cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
  z-index:100;
}
.back-to-bottom:hover{ background:var(--app-color-background-elevated); color:var(--app-color-text-primary); }
`;

/** 浮层：Toast、Back-to-bottom。 */
export const OVERLAYS_CSS = `
/* Toast */
.ui-toast-shell{ pointer-events:none; }
.ui-toast[data-testid="toast"]{
  position:absolute; top:calc(var(--app-header-height, 48px) + 10px); right:12px; left:auto; bottom:auto; z-index:2000;
  width:auto; min-width:220px; max-width:min(420px, calc(100% - 24px)); min-height:44px; max-height:calc(100% - 48px); overflow-y:auto; pointer-events:auto;
  display:flex; align-items:flex-start;
  padding:8px 10px 8px 12px; border:1px solid var(--app-color-border-default); border-radius:10px;
  background:color-mix(in srgb, var(--app-color-background-elevated) 97%, black 3%); color:var(--app-color-text-primary);
  box-sizing:border-box;
  font-size:14px; line-height:20px;
}
.ui-toast[data-variant="positive"]{ border-color:color-mix(in srgb, var(--app-color-positive) 18%, var(--app-color-border-default)); background:color-mix(in srgb, var(--app-color-background-elevated) 94%, var(--app-color-positive) 6%); }
.ui-toast[data-variant="negative"]{ border-color:color-mix(in srgb, var(--app-color-negative) 34%, var(--app-color-border-default)); background:color-mix(in srgb, var(--app-color-background-elevated) 88%, var(--app-color-negative) 12%); }
.ui-toast[data-variant="warning"]{ border-color:color-mix(in srgb, var(--app-color-notice) 34%, var(--app-color-border-default)); background:color-mix(in srgb, var(--app-color-background-elevated) 89%, var(--app-color-notice) 11%); }
.ui-toast[data-variant="info"]{ border-color:color-mix(in srgb, var(--app-color-informative) 32%, var(--app-color-border-default)); background:color-mix(in srgb, var(--app-color-background-elevated) 90%, var(--app-color-informative) 10%); }
.ui-toast[data-variant="neutral"]{ border-color:var(--app-color-border-default); background:color-mix(in srgb, var(--app-color-background-elevated) 96%, black 4%); }
.ui-toast[data-motion-state="exiting"]{ pointer-events:none; }
.ui-toast-icon{
  display:inline-flex; align-items:flex-start; justify-content:center; flex:0 0 18px;
  width:18px; min-width:18px; min-height:20px; margin-top:2px; margin-right:10px; color:var(--app-color-text-secondary);
}
.ui-toast[data-variant="positive"] .ui-toast-icon{ color:var(--app-color-positive); }
.ui-toast[data-variant="negative"] .ui-toast-icon{ color:var(--app-color-negative); }
.ui-toast[data-variant="warning"] .ui-toast-icon{ color:var(--app-color-notice); }
.ui-toast[data-variant="info"] .ui-toast-icon{ color:var(--app-color-informative); }
.ui-toast-message{
  flex:1 1 auto; min-width:0; overflow-wrap:anywhere; color:var(--app-color-text-primary);
  font-weight:500;
}
.ui-toast-close-host{
  flex:0 0 auto;
  align-self:flex-start;
  width:28px; min-width:28px; height:28px; min-height:28px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:10px;
}
.ui-toast-close{
  width:28px; min-width:28px; height:28px; min-height:28px; padding:0;
  border:none; border-radius:7px; background:transparent; color:var(--app-color-text-muted);
  display:inline-flex; align-items:center; justify-content:center;
}
.ui-toast-close:hover{ background:var(--app-color-hover-overlay); color:var(--app-color-text-primary); }
.ui-toast-close-overlay{
  display:inline-flex; align-items:center; justify-content:center;
}

/* Back to bottom */
.back-to-bottom-host{
  position:absolute; right:12px; bottom:calc(100% + 12px);
  width:32px; min-width:32px; height:32px; min-height:32px;
  z-index:100;
}
.back-to-bottom{
  width:32px; min-width:32px; height:32px; min-height:32px; padding:0; border-radius:50%;
  background:var(--app-color-background-layer-2); border:1px solid var(--app-color-border-default);
  color:var(--app-color-text-secondary); cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
}
.back-to-bottom:hover{ background:var(--app-color-background-elevated); color:var(--app-color-text-primary); }
`;

/** 浮层：Toast、Back-to-bottom。 */
export const OVERLAYS_CSS = `
/* Popup layer */
.ui-popup-layer-root{
  position:absolute; top:0; right:0; bottom:0; left:0;
  z-index:1400;
  pointer-events:none;
}
.ui-popup-layer-root > *{ pointer-events:auto; }

/* Toast */
.ui-toast-shell{ pointer-events:none; }
.ui-toast[data-testid="toast"]{
  position:absolute; top:calc(var(--app-header-height, 48px) + 10px); right:12px; left:auto; bottom:auto; z-index:2000;
  --toast-bg-current:var(--toast-bg-neutral);
  --toast-border-current:var(--toast-border-neutral);
  --toast-icon-current:var(--toast-icon-neutral);
  width:var(--toast-max-width); min-width:220px; max-width:calc(100% - 24px); min-height:var(--toast-min-height); max-height:calc(100% - 48px); overflow-y:auto; pointer-events:auto;
  display:flex; align-items:flex-start;
  padding:var(--toast-padding-y) var(--toast-padding-x); border:1px solid var(--toast-border-current); border-radius:var(--toast-radius);
  background:var(--toast-bg-current); color:var(--toast-fg-primary);
  box-sizing:border-box;
  font-size:13px; line-height:18px;
}
.ui-toast[data-variant="positive"]{ --toast-bg-current:var(--toast-bg-positive); --toast-border-current:var(--toast-border-positive); --toast-icon-current:var(--toast-icon-positive); }
.ui-toast[data-variant="negative"]{ --toast-bg-current:var(--toast-bg-negative); --toast-border-current:var(--toast-border-negative); --toast-icon-current:var(--toast-icon-negative); }
.ui-toast[data-variant="warning"]{ --toast-bg-current:var(--toast-bg-warning); --toast-border-current:var(--toast-border-warning); --toast-icon-current:var(--toast-icon-warning); }
.ui-toast[data-variant="info"]{ --toast-bg-current:var(--toast-bg-info); --toast-border-current:var(--toast-border-info); --toast-icon-current:var(--toast-icon-info); }
.ui-toast[data-variant="neutral"]{ --toast-bg-current:var(--toast-bg-neutral); --toast-border-current:var(--toast-border-neutral); --toast-icon-current:var(--toast-icon-neutral); }
.ui-toast[data-motion-state="exiting"]{ pointer-events:none; }
.ui-toast-icon{
  display:inline-flex; align-items:flex-start; justify-content:center; flex:0 0 16px;
  width:16px; min-width:16px; min-height:18px; margin-top:1px; margin-right:var(--toast-gap); color:var(--toast-icon-current);
}
.ui-toast-message{
  flex:1 1 auto; min-width:0; overflow-wrap:anywhere; color:var(--toast-fg-primary);
  font-weight:500;
}
.ui-toast-action{
  flex:0 0 auto;
  min-height:26px; padding:0 8px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:var(--toast-gap);
  border:none; border-radius:6px; background:transparent; color:var(--toast-icon-current);
  font-size:12px; line-height:16px;
}
.ui-toast-action:hover{
  background:color-mix(in srgb, var(--toast-fg-secondary) 14%, transparent);
}
.ui-toast-close-host{
  flex:0 0 auto;
  align-self:flex-start;
  width:28px; min-width:28px; height:28px; min-height:28px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:var(--toast-gap);
}
.ui-toast-close{
  width:28px; min-width:28px; height:28px; min-height:28px; padding:0;
  border:none; border-radius:6px; background:transparent; color:var(--toast-fg-secondary);
  display:inline-flex; align-items:center; justify-content:center;
}
.ui-toast-close:hover{ background:color-mix(in srgb, var(--toast-fg-secondary) 14%, transparent); color:var(--toast-fg-primary); }
.ui-toast-close-overlay{
  display:inline-flex; align-items:center; justify-content:center;
  color:inherit;
}

/* Back to bottom */
.back-to-bottom-host{
  position:absolute; left:50%; bottom:calc(100% + 10px);
  width:40px; min-width:40px; height:28px; min-height:28px;
  margin-left:-20px;
  z-index:100;
  box-sizing:border-box;
}
.back-to-bottom{
  width:40px; min-width:40px; height:28px; min-height:28px; padding:0; border-radius:9px;
  background:var(--app-color-background-layer-1); border:1px solid var(--app-color-border-default);
  color:var(--app-color-text-secondary); cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
  box-sizing:border-box;
  line-height:0;
}
.back-to-bottom:hover{ background:var(--app-color-background-elevated); color:var(--app-color-text-primary); }
`;

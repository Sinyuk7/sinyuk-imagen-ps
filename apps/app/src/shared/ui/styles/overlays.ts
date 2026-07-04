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
  --toast-icon-current:var(--toast-icon-neutral);
  width:var(--toast-max-width); min-width:220px; max-width:calc(100% - 24px); min-height:var(--toast-min-height); max-height:calc(100% - 48px); overflow-y:auto; pointer-events:auto;
  display:flex; align-items:stretch;
  padding-top:0; padding-right:0; padding-bottom:0; padding-left:var(--toast-padding-x); border:none; border-radius:var(--toast-radius);
  background:var(--toast-bg-current); color:var(--toast-fg-primary);
  box-sizing:border-box;
  font-size:13px; line-height:18px;
}
.ui-toast[data-variant="positive"]{ --toast-bg-current:var(--toast-bg-positive); --toast-icon-current:var(--toast-icon-positive); }
.ui-toast[data-variant="negative"]{ --toast-bg-current:var(--toast-bg-negative); --toast-icon-current:var(--toast-icon-negative); }
.ui-toast[data-variant="warning"]{ --toast-bg-current:var(--toast-bg-warning); --toast-icon-current:var(--toast-icon-warning); }
.ui-toast[data-variant="info"]{ --toast-bg-current:var(--toast-bg-info); --toast-icon-current:var(--toast-icon-info); }
.ui-toast[data-variant="neutral"]{ --toast-bg-current:var(--toast-bg-neutral); --toast-icon-current:var(--toast-icon-neutral); }
.ui-toast[data-motion-state="exiting"]{ pointer-events:none; }
.ui-toast-icon{
  display:inline-flex; align-items:center; justify-content:center; flex:0 0 16px;
  width:16px; min-width:16px; min-height:var(--toast-min-height); margin-top:0; margin-right:var(--toast-gap); margin-bottom:0; margin-left:0; color:var(--toast-icon-current);
}
.ui-toast-content{
  flex:1 1 auto;
  min-width:0;
  display:flex;
  align-items:center;
  padding-top:var(--toast-padding-y);
  padding-right:var(--toast-padding-x);
  padding-bottom:var(--toast-padding-y);
  padding-left:0;
}
.ui-toast-message-wrap{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
}
.ui-toast-message{
  display:block;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:var(--toast-fg-primary);
  font-size:13px;
  line-height:18px;
  font-weight:600;
}
.ui-toast[data-text-size="sm"] .ui-toast-message{
  font-size:12px;
  line-height:17px;
}
.ui-toast[data-text-size="xs"] .ui-toast-message{
  font-size:11px;
  line-height:16px;
}
.ui-toast-action{
  flex:0 0 auto;
  min-height:26px; padding:0 8px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:var(--toast-gap);
  border:none; border-radius:6px; background:transparent; color:var(--toast-icon-current);
  font-size:12px; line-height:16px;
  opacity:.82;
}
.ui-toast-action:hover{
  background:transparent;
  opacity:1;
}
.ui-toast-close-host{
  flex:0 0 auto;
  align-self:stretch;
  width:52px; min-width:52px; height:auto; min-height:var(--toast-min-height); margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  border-left:1px solid color-mix(in srgb, var(--toast-fg-secondary) 24%, transparent);
  display:inline-flex;
}
.ui-toast-close{
  width:100%; min-width:100%; height:100%; min-height:var(--toast-min-height); padding:0;
  border:none; border-radius:0; background:transparent; color:var(--toast-fg-secondary);
  display:inline-flex; align-items:center; justify-content:center;
  opacity:.72;
}
.ui-toast-close:hover{ background:transparent; color:var(--toast-fg-primary); opacity:1; }
.ui-toast-close-overlay{
  display:inline-flex; align-items:center; justify-content:center;
  width:100%;
  height:100%;
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

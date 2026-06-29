/** 浮层：Toast、Back-to-bottom。 */
export const OVERLAYS_CSS = `
/* Toast (sp-toast host positioning) */
sp-toast[data-testid="toast"]{
  position:absolute; top:calc(var(--app-header-height, 48px) + 10px); right:12px; left:auto; bottom:auto; z-index:2000;
  max-width:calc(100% - 48px); max-height:calc(100% - 48px); overflow-y:auto; pointer-events:auto;
}

/* Back to bottom */
.back-to-bottom{
  position:absolute; right:12px; bottom:calc(100% + 12px);
  width:32px; height:32px; border-radius:50%;
  background:var(--app-color-background-layer-2); border:1px solid var(--app-color-border-default);
  color:var(--app-color-text-secondary); cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  z-index:100;
}
.back-to-bottom:hover{ background:var(--app-color-background-elevated); color:var(--app-color-text-primary); }
`;

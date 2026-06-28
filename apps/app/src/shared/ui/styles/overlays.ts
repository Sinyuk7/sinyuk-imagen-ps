/** 浮层：Lightbox、Toast、Back-to-bottom。 */
export const OVERLAYS_CSS = `
/* Compare Lightbox */
.lightbox{
  position:absolute; top:0; right:0; bottom:0; left:0; background:rgba(0,0,0,.92); z-index:1000;
  display:flex; align-items:center; justify-content:center;
}
.lb-inner{ position:relative; display:flex; flex-direction:column; align-items:center; }
.lb-actions{ margin-top:12px; display:flex; }
.lb-close{
  position:absolute; top:-42px; right:0;
  background:transparent; border:none; color:rgba(255,255,255,.4);
  cursor:pointer; font-size:26px; line-height:1;
}
.lb-close:hover{ color:#fff; }
.compare-wrap{
  position:relative; width:500px; height:500px; max-width:calc(100% - 48px); max-height:calc(100% - 48px); border-radius:var(--app-radius-medium);
  overflow:hidden; user-select:none; border:1px solid var(--app-color-border-default);
}
.cmp-layer{ position:absolute; top:0; right:0; bottom:0; left:0; }
.cmp-divider{
  position:absolute; top:0; bottom:0; width:2px;
  background:rgba(255,255,255,.9);
  pointer-events:none;
}
.cmp-handle{
  position:absolute; top:50%; left:50%;
  width:36px; height:36px; border-radius:50%; background:white;
  display:flex; align-items:center; justify-content:center;
}
.cmp-lbl{
  position:absolute; top:10px;
  background:rgba(0,0,0,.55); padding:2px 8px; border-radius:4px;
  font-family:var(--app-font-family-mono); font-size:10px; color:white; letter-spacing:.3px;
}
.lb-btn{
  margin-top:0; margin-right:8px; margin-bottom:0; margin-left:0; padding:8px 20px; border-radius:var(--app-radius-small); border:none;
  font-family:var(--app-font-family-base); font-size:12px; font-weight:600; cursor:pointer;
  display:flex; align-items:center;
}
.lb-btn [data-icon]{ margin-right:6px; }
.lb-btn.prim{ background:var(--app-color-accent-default); color:var(--app-color-text-on-accent); }
.lb-btn.prim:hover{ background:var(--app-color-accent-hover); }
.lb-btn.sec{ background:var(--app-color-background-elevated); color:var(--app-color-text-secondary); }
.lb-btn.sec:hover{ background:var(--app-color-border-strong); color:var(--app-color-text-primary); }

/* Toast (sp-toast host positioning) */
sp-toast[data-testid="toast"]{
  position:absolute; top:12px; right:12px; left:auto; bottom:auto; z-index:2000;
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

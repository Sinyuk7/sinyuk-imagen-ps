/** 独立领域列表的共享行几何；只使用已有 app token。 */
export const LIST_CSS = `
.ui-list{display:flex;flex-direction:column;min-width:0}.ui-list-item-spaced{margin-top:var(--app-space-2)}
.ui-list-item-shell{align-items:center;background:var(--app-color-background-layer-2);border:1px solid var(--app-color-border-default);display:flex;min-height:56px;min-width:0;padding:8px 14px}
.ui-list-item-shell--interactive{cursor:pointer}.ui-list-item-shell--interactive:hover{background:var(--app-color-hover-overlay)}.ui-list-item-shell--interactive:active{background:var(--app-color-active-overlay)}.ui-list-item-shell--interactive:focus-visible{background:var(--app-color-hover-overlay);outline:2px solid var(--app-color-focus-ring);outline-offset:-1px}
.ui-list-item-shell--disabled{cursor:default;opacity:.62}.ui-list-item-shell--muted{color:var(--app-color-text-secondary)}.ui-list-item-shell--danger{border-color:var(--app-color-negative);color:var(--app-color-negative)}
.ui-list-item-leading{align-items:center;display:flex;flex:0 0 auto;margin-right:8px}.ui-list-item-content{display:flex;flex:1;flex-direction:column;justify-content:center;min-width:0}.ui-list-item-title{color:inherit;font-size:12px;font-weight:600;line-height:16px;min-width:0}.ui-list-item-description{color:var(--app-color-text-secondary);font-size:10px;line-height:14px;margin-top:1px;min-width:0}.ui-list-item-trailing{align-items:center;display:flex;flex:0 0 auto;margin-left:8px}
`;

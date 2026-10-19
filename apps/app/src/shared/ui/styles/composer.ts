/** Composer：底部输入区、chip 触发器、select 菜单、附件、图层列表。 */
export const COMPOSER_CSS = `
/* 字段统一规格 tokens */
:root {
  --cmp-field-label-size: 9px;
  --cmp-field-label-line: 12px;
  --cmp-field-control-size: 10px;
  --cmp-field-control-line: 14px;
  --cmp-field-control-height: 28px;
  --cmp-field-control-padding-v: 4px;
  --cmp-field-control-padding-h: 8px;
}

.composer{
  flex-shrink:0; padding:8px 12px 12px; background:var(--app-color-background-base);
  border-top:1px solid var(--app-color-border-default); position:relative;
  max-height:min(58%, 360px); overflow:visible;
}

/* Attachment row */
.attach-row{
  display:flex; align-items:flex-start; overflow-x:auto; padding:0 0 6px; scrollbar-width:none; flex-wrap:nowrap;
}
.attach-row::-webkit-scrollbar{ display:none; }
.att-add-host{
  margin-top:0;
  margin-right:6px;
  margin-bottom:0;
  margin-left:0;
}
.att-add{
  width:40px;
  height:40px;
  min-width:40px;
  min-height:0;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding:0;
  border:1px solid var(--app-color-border-default);
  border-radius:8px;
  background:var(--app-color-background-layer-1);
  color:var(--app-color-text-secondary);
  flex:0 0 auto;
}
.att-add:hover{
  border-color:var(--app-color-border-strong);
  background:var(--app-color-background-elevated);
}
.att-thumb{
  position:relative; width:40px; height:40px; margin-right:6px; border-radius:8px;
  overflow:hidden; border:1px solid var(--app-color-border-default); flex-shrink:0;
}
.att-thumb > .motion-highlight{
  bottom:0;
  border-radius:inherit;
}
.att-thumb:last-child{ margin-right:0; }
.att-thumb-img{ width:100%; height:100%; object-fit:cover; display:block; }
.att-rm-host{
  position:absolute; top:2px; right:2px; width:18px; min-width:18px; height:18px; min-height:18px;
  color:var(--app-color-text-primary);
}
.att-rm{
  width:18px; min-width:18px; height:18px; min-height:18px; border-radius:50%;
  border:1px solid var(--app-color-border-default);
  background:var(--app-color-background-elevated);
  color:inherit; cursor:pointer; padding:0;
  display:inline-flex; align-items:center; justify-content:center;
}
.att-rm:hover{
  border-color:var(--app-color-border-strong);
  background:var(--app-color-hover-overlay);
  color:var(--app-color-text-primary);
}

/* Header profile menu (absolute) —— 默认对齐 header center 区域；
 * 窄面板时由 responsive root mode 收敛到 panel 内 full-width containment。 */
.model-menu{
  position:absolute; top:52px; left:84px; right:12px;
  background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-default); border-radius:var(--app-radius-small);
  padding:4px;
  overflow-y:auto; min-width:140px; max-height:240px; z-index:200;
}
.hdr-model-menu{
  top:calc(100% + 8px);
  left:12px;
  right:12px;
  width:auto;
  max-width:280px;
  margin-left:auto;
  margin-right:auto;
}
.model-opt{
  min-height:32px; padding:8px 10px; border:0; border-radius:4px; outline:none;
  font-family:var(--app-font-family-mono); font-size:12px; color:var(--app-color-text-secondary);
  cursor:pointer; display:flex; align-items:center; width:100%; background:transparent; text-align:left;
}
.model-opt [data-icon]{ margin-right:8px; }
.model-opt:hover,
.model-opt:focus-visible{ background:var(--app-color-hover-overlay); color:var(--app-color-text-primary); }
.model-opt.act{ background:var(--app-color-accent-subtle); color:var(--app-color-accent-default); }
.profile-popup-list .ui-list-item-spaced{ margin-top:4px; }
.profile-popup-list .ui-list-item-shell{ border:0; background:transparent; }
.model-opt > span:last-child{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.model-menu .popup-list-state.ui-list-item-shell,
.layer-scroll .popup-list-state.ui-list-item-shell{
  min-height:36px;
  padding:5px 8px;
  border-top:0;
  border-right:0;
  border-bottom:1px solid var(--app-color-border-default);
  border-left:0;
  background:transparent;
}
.model-menu .popup-list-state .ui-list-item-title,
.layer-scroll .popup-list-state .ui-list-item-title{ font-family:var(--app-font-family-mono); font-size:12px; font-weight:400; }
.layer-scroll .popup-list-state .ui-list-item-title{ color:var(--app-color-text-secondary); }

/* Attach picker */
.attach-picker{
  position:absolute; left:0; bottom:calc(100% + 6px);
  background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-strong); border-radius:var(--app-radius-medium);
  overflow-y:auto; width:196px; max-width:calc(100% - 24px); max-height:240px; z-index:200;
}
.attach-opt{
  display:flex; align-items:center; padding:10px 14px;
  cursor:pointer; border-bottom:1px solid var(--app-color-border-default);
}
.attach-opt:last-child{ border-bottom:none; }
.attach-opt:hover{ background:var(--app-color-hover-overlay); }
.attach-opt-ico{ width:28px; height:28px; margin-right:10px; border-radius:var(--app-radius-small); background:var(--app-color-background-layer-2); display:flex; align-items:center; justify-content:center; color:var(--app-color-text-secondary); flex-shrink:0; }
.attach-opt-label{ font-size:12px; font-weight:500; color:var(--app-color-text-primary); }
.attach-opt-sub{ font-size:10px; color:var(--app-color-text-muted); font-family:var(--app-font-family-mono); margin-top:1px; }
.attach-opt-hint{ font-family:var(--app-font-family-base); line-height:1.35; max-width:132px; }
.attach-opt-chevron{ margin-left:auto; }

/* Layer list */
.layer-list-wrap{
  position:absolute; left:0; bottom:calc(100% + 6px);
  background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-strong); border-radius:var(--app-radius-medium);
  overflow:hidden; width:230px; max-width:calc(100% - 24px); max-height:240px; z-index:201;
  display:flex; flex-direction:column;
}
.layer-list-hdr{
  padding:5px 8px; font-size:11px; font-weight:500; color:var(--app-color-text-secondary);
  border-bottom:1px solid var(--app-color-border-default);
  display:flex; align-items:center; min-height:30px;
}
.layer-back{ margin-top:0; margin-right:6px; margin-bottom:0; margin-left:0; min-height:0; padding:0; background:transparent; border:none; color:var(--app-color-text-secondary); cursor:pointer; display:inline-flex; align-items:center; }
.layer-refresh{ margin-top:0; margin-right:0; margin-bottom:0; margin-left:auto; min-height:0; padding:0; background:transparent; border:none; color:var(--app-color-text-secondary); cursor:pointer; display:inline-flex; align-items:center; }
.layer-scroll{ max-height:190px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--app-color-border-default) transparent; }
.layer-scroll::-webkit-scrollbar{ width:3px; }
.layer-item{
  display:flex; align-items:center; padding:5px 8px;
  cursor:pointer; min-height:36px;
}
.layer-item + .layer-item{ border-top:1px solid var(--app-color-border-default); }
.layer-item:hover{ background:var(--app-color-hover-overlay); }
.layer-thumb{ width:28px; height:28px; margin-top:0; margin-right:8px; margin-bottom:0; margin-left:0; border-radius:4px; flex-shrink:0; border:1px solid var(--app-color-border-default); background:var(--app-color-background-layer-2); overflow:hidden; position:relative; }
.layer-thumb[data-visible="false"]{ background:var(--app-color-background-layer-1); }
.layer-thumb-img{ width:100%; height:100%; object-fit:cover; display:block; opacity:0; }
.layer-thumb-img-loaded{ opacity:1; }
.layer-body{ display:flex; flex-direction:column; justify-content:center; min-width:0; flex:1; padding-left:calc(var(--ui-layer-depth) * 10px); }
.layer-name{ font-size:12px; line-height:16px; font-weight:500; color:var(--app-color-text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:rtl; text-align:left; unicode-bidi:plaintext; }
.layer-body .layer-name{ margin-bottom:1px; }
.layer-name[title]:hover{ color:var(--app-color-text-secondary); }
.layer-meta{ display:flex; align-items:center; min-width:0; }
.layer-meta [data-icon]{ margin-top:0; margin-right:3px; margin-bottom:0; margin-left:0; }
.layer-meta-lbl{ font-family:var(--app-font-family-mono); font-size:9px; line-height:12px; color:var(--app-color-text-muted); white-space:nowrap; }

/* Composer shell */
.cmp-shell{
  width:100%;
  display:flex;
  flex-direction:column;
  max-height:100%;
  min-height:0;
  background:var(--app-color-background-layer-2);
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-large);
  padding:0;
}
.cmp-shell.off{ opacity:.38; pointer-events:none; }
.cmp-shell-motion.off{ pointer-events:none; }
.cmp-attach-band{
  position:relative;
  display:flex;
  flex-direction:column;
  flex:0 0 auto;
  min-height:0;
  margin-bottom:0;
  padding:6px 8px 0;
  background:var(--app-color-background-elevated);
  border-radius:var(--app-radius-large) var(--app-radius-large) 0 0;
}
.cmp-core{
  width:100%;
  background:var(--app-color-background-layer-2);
  border:none;
  border-radius:0;
  padding:4px 8px 6px;
  display:flex;
  flex-direction:column;
  flex:1 1 auto;
  min-height:0;
}
.cmp-shell:focus-within{ border-color:var(--app-color-border-strong); }
.cmp-body{
  display:flex;
  flex-direction:column;
  flex:1 1 auto;
  min-height:88px;
  position:relative;
  padding-top:0;
  padding-right:6px;
  padding-bottom:3px;
  padding-left:6px;
  border:1px solid transparent;
  border-radius:0;
  background:transparent;
}
.cmp-body:focus-within{
  border-color:var(--app-color-focus-ring);
  background:var(--app-color-accent-subtle);
  background:color-mix(in srgb, var(--app-color-accent-subtle) 22%, transparent);
}
.cmp-action-row,
.cmp-toolbar{
  display:flex;
  align-items:center;
  min-width:0;
}
.cmp-action-row{ flex:0 0 auto; flex-wrap:nowrap; margin-top:auto; padding-top:4px; }
.cmp-toolbar{
  margin-top:6px;
  padding:0;
  border-top:none;
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  flex:0 0 auto;
}
.cmp-parameter-row{ display:flex; align-items:center; min-width:0; min-height:32px; }
.cmp-parameter-field{
  display:flex;
  align-items:center;
  min-width:0;
  min-height:var(--cmp-field-control-height);
  flex:0 1 auto;
}
.cmp-parameter-control{
  display:flex;
  min-width:0;
  flex:1 1 auto;
  font-size:var(--cmp-field-control-size);
  line-height:var(--cmp-field-control-line);
  min-height:var(--cmp-field-control-height);
}
.cmp-parameter-control > .cmp-select{ width:100%; min-width:0; flex:1 1 auto; }
.cmp-parameter-label{
  flex:0 0 auto;
  margin-right:5px;
  color:var(--app-color-text-muted);
  font-size:var(--cmp-field-label-size);
  line-height:var(--cmp-field-label-line);
  white-space:nowrap;
  align-self:center;
}
.cmp-parameter-row > .cmp-parameter-field{ margin-right:6px; }
.cmp-parameter-row > :last-child{ margin-right:0; }
.cmp-model-row{ width:100%; }
.cmp-secondary-row{
  width:100%;
  margin-top:5px;
  flex-wrap:nowrap;
  display:flex;
}
.cmp-model-slot{ width:100%; flex:1 1 auto; }
.cmp-prompt-slot{ flex:2 1 0; }
.cmp-ratio-slot,.cmp-size-slot{ flex:1 1 0; }
.cmp-select-labeled{ flex:1 1 auto; }
.cmp-select-labeled .cmp-chip-host{ min-width:0; width:100%; }
.cmp-parameter-row .cmp-chip-text{ min-width:0; width:100%; justify-content:space-between; }
.cmp-parameter-row .cmp-chip-value-text{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cmp-advanced-toggle-row{ width:100%; margin-top:5px; }
.cmp-advanced-toggle{
  display:flex;
  flex-direction:row;
  align-items:center;
  justify-content:center;
  box-sizing:border-box;
  width:100%;
  height:30px;
  min-height:30px;
  padding:0 8px;
  border-radius:var(--app-radius-small);
  color:var(--app-color-text-muted);
  font-size:10px;
  line-height:1;
  white-space:nowrap;
}
.cmp-advanced-toggle-content{
  display:inline-flex;
  flex-direction:row;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  height:100%;
  line-height:1;
  white-space:nowrap;
}
.cmp-advanced-toggle-content [data-icon]{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  width:14px;
  height:14px;
  margin-left:6px;
  vertical-align:middle;
}
.cmp-advanced-row{
  margin-top:5px;
  display:flex;
  flex-wrap:wrap;
}
.cmp-advanced-field{
  flex:1 1 46%;
  min-width:0;
  margin-right:4%;
  margin-bottom:5px;
}
.cmp-advanced-field:nth-child(2n){ margin-right:0; }
.cmp-summary-model{
  flex:0 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:var(--app-color-text-primary);
  font-size:10px;
  font-weight:500;
  line-height:14px;
}
.cmp-summary-details{
  display:flex;
  align-items:center;
  min-width:0;
  margin-left:8px;
  overflow:hidden;
}
.cmp-summary-detail{
  display:inline-flex;
  align-items:center;
  min-width:0;
  color:var(--app-color-text-muted);
  font-size:10px;
  line-height:14px;
  white-space:nowrap;
  margin-right:8px;
}
.cmp-summary-detail:last-child{ margin-right:0; }
.cmp-summary-detail::before{
  content:'·';
  margin-right:4px;
  color:var(--app-color-border-strong);
  opacity:0.5;
}
.cmp-summary-detail-quality{
  color:var(--app-color-text-secondary);
  font-weight:500;
}
.cmp-meta-row > .cmp-readiness{ flex:0 1 auto; margin-left:8px; white-space:nowrap; }
.cmp-action-left{
  display:flex;
  align-items:center;
  min-width:0;
  flex:1 1 auto;
  overflow:visible;
}
.cmp-action-right{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  min-width:0;
  flex:0 0 auto;
  overflow:visible;
}
.cmp-action-left{
}
.cmp-mask-toggle-host{ margin-top:0; margin-right:0; margin-bottom:0; margin-left:4px; }
.cmp-mask-toggle{ color:var(--app-color-text-secondary); }
.cmp-mask-retry{ min-height:22px; margin-left:6px; padding:0 7px; font-size:10px; }
.cmp-select{ position:relative; display:flex; align-items:center; min-width:0; flex-shrink:1; }
.cmp-select-model{
  flex:1 1 auto;
  min-width:0;
  max-width:100%;
}
.cmp-capture{
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
}
.cmp-select-output-size{ flex:0 1 auto; min-width:64px; margin:0 4px 0 0; }
.cmp-select-menu{
  position:absolute; left:0; bottom:calc(100% + 6px); z-index:200;
  min-width:0; max-width:320px; background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-strong); border-radius:var(--app-radius-small);
  overflow:hidden;
}
.cmp-select-underlay{
  position:absolute; top:0; right:0; bottom:0; left:0; z-index:10;
  background:transparent;
}
.cmp-select-menu-portal{ z-index:20; }
.cmp-select-menu[data-motion-state="exiting"]{ pointer-events:none; }
.cmp-select-menu-motion{
  width:100%;
  max-height:inherit;
  background:transparent;
  border-radius:inherit;
  overflow:hidden;
}
.cmp-select-menu-down{ top:auto; bottom:auto; }
.cmp-select-menu-up{ top:auto; bottom:auto; }
.cmp-select-menu-start{ left:auto; right:auto; }
.cmp-select-menu-end{ left:auto; right:auto; }
.cmp-select-menu-model{ min-width:0; }
.cmp-select-menu-compact{ min-width:0; }
.cmp-select-listbox{
  display:flex;
  flex-direction:column;
  width:100%;
  min-width:0;
  max-height:inherit;
  padding:4px;
  overflow-y:auto;
  scrollbar-width:thin;
  scrollbar-color:var(--app-color-border-default) transparent;
}
.cmp-select-listbox::-webkit-scrollbar{ width:3px; }
.cmp-select-listbox::-webkit-scrollbar-thumb{ background:var(--app-color-border-default); border-radius:2px; }
.cmp-select-listbox:focus{ outline:none; }
.cmp-select-option{
  display:flex;
  align-items:center;
  width:100%;
  min-width:0;
  height:28px;
  min-height:28px;
  margin-top:0;
  margin-right:0;
  margin-bottom:4px;
  margin-left:0;
  padding:4px 7px;
  border-radius:4px;
  border:none;
  background:transparent;
  color:var(--app-color-text-secondary);
  cursor:pointer;
  font-family:var(--app-font-family-base);
  font-size:10px;
  line-height:14px;
  text-align:left;
}
.cmp-select-menu-compact .cmp-select-option{
  height:32px;
  min-height:32px;
  padding:6px 7px;
}
.cmp-select-option:last-child{ margin-bottom:0; }
.cmp-select-option:hover,
.cmp-select-option:focus-visible{
  background:var(--app-color-hover-overlay);
  color:var(--app-color-text-primary);
  outline:none;
}
.cmp-select-option.disabled{
  cursor:not-allowed;
  opacity:.58;
}
.cmp-select-option.disabled:hover{
  background:transparent;
  color:var(--app-color-text-secondary);
}
.cmp-select-option.selected{
  background:var(--app-color-accent-subtle);
  color:var(--app-color-accent-default);
}
.cmp-select-option-icon{
  flex:0 0 auto;
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.cmp-select-option-body{
  display:flex;
  align-items:center;
  flex:1 1 auto;
  min-width:0;
}
.cmp-select-option-label{
  display:block;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.cmp-select-option-badges{
  display:flex;
  flex:0 0 auto;
  align-items:center;
  margin-left:8px;
}
.cmp-select-option-badge{
  display:inline-flex;
  align-items:center;
  min-height:16px;
  padding-top:0;
  padding-right:5px;
  padding-bottom:0;
  padding-left:5px;
  margin-left:4px;
  border-radius:6px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-muted);
  font-family:var(--app-font-family-base);
  font-size:9px;
  line-height:12px;
}
.cmp-ta{
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  display:block;
  flex:1 1 auto;
  min-height:0;
  max-height:none;
  width:100%;
  height:100%;
}
.cmp-ta-shell{
  display:flex;
  flex-direction:column;
  flex:1 1 auto;
  width:100%;
  min-height:82px;
  min-width:0;
  align-items:stretch;
}
.cmp-readiness{
  min-height:17px;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  color:var(--app-color-text-muted);
  font-size:11px;
  line-height:15px;
  overflow-wrap:anywhere;
}
.cmp-readiness[data-state="ready"]{ color:var(--app-color-positive); }
.cmp-meta-row{
  display:flex;
  align-items:center;
  min-width:0;
  min-height:17px;
  margin-top:0;
}
.cmp-meta-row > .motion-content{ flex:1 1 auto; min-width:0; text-align:right; }
.cmp-footer{
  flex:0 0 auto;
  padding:8px 8px 10px;
  background:var(--app-color-background-elevated);
  border-radius:0 0 var(--app-radius-large) var(--app-radius-large);
}
.cmp-footer .cmp-readiness{
  opacity:.68;
}
.cmp-conflict{
  margin-top:6px;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding-top:6px;
  padding-right:8px;
  padding-bottom:6px;
  padding-left:8px;
  border:1px solid var(--app-color-border-default);
  border:1px solid color-mix(in srgb, var(--app-color-notice) 36%, var(--app-color-border-default));
  border-radius:7px;
  background:var(--app-color-background-elevated);
  background:color-mix(in srgb, var(--app-color-background-elevated) 90%, var(--app-color-notice) 10%);
  color:var(--app-color-text-primary);
  font-size:11px;
  line-height:15px;
}
.cmp-conflict-actions{
  display:flex;
  align-items:center;
  margin-top:6px;
}
.cmp-conflict-actions > *{ margin-right:6px; }
.cmp-conflict-actions > *:last-child{ margin-right:0; }
.cmp-conflict-action{
  min-height:24px;
  padding-top:0;
  padding-right:8px;
  padding-bottom:0;
  padding-left:8px;
  border:1px solid var(--app-color-border-default);
  border-radius:7px;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-primary);
  font-size:10px;
  line-height:14px;
  cursor:pointer;
}
.cmp-conflict-action:hover{ background:var(--app-color-hover-overlay); }

/* + attach button */
.cmp-add{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; color:var(--app-color-text-secondary); flex-shrink:0;
}

/* Model chip (native dropdown trigger) */
.cmp-chip{
  display:flex; align-items:center;
  min-width:0; width:100%;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  cursor:pointer; user-select:none; flex-shrink:1;
}
.cmp-chip-icon,
.cmp-chip-text{
  max-width:100%;
  min-height:var(--cmp-field-control-height);
  padding:var(--cmp-field-control-padding-v) var(--cmp-field-control-padding-h);
  border:1px solid var(--app-color-border-default);
  border-radius:var(--app-radius-medium);
  background:var(--app-color-background-layer-1);
  font-family:var(--app-font-family-base);
  font-size:var(--cmp-field-control-size);
  line-height:var(--cmp-field-control-line);
  color:var(--app-color-text-secondary);
  white-space:nowrap;
}
.cmp-chip-icon{
  padding:4px 12px 4px 14px;
  overflow:hidden;
  text-overflow:ellipsis;
  text-align:left;
}
/* 移除 Model 选择器的特殊字体处理，统一使用字段规格 */
.cmp-select-model .cmp-chip-icon,
.cmp-select-output-size .cmp-chip-icon{
  border-color:color-mix(in srgb, var(--app-color-border-default) 72%, transparent);
  background:transparent;
}
.cmp-chip-icon:hover,
.cmp-chip-text:hover{ border-color:var(--app-color-border-strong); color:var(--app-color-text-primary); }
.cmp-chip-icon.open,
.cmp-chip-text.open{ border-color:var(--app-color-accent-default); color:var(--app-color-accent-default); }
.cmp-select-model .cmp-chip-icon:hover,
.cmp-select-output-size .cmp-chip-icon:hover{
  background:var(--app-color-hover-overlay);
}
.cmp-select-model .cmp-chip-icon.open,
.cmp-select-output-size .cmp-chip-icon.open{
  background:var(--app-color-accent-subtle);
  background:color-mix(in srgb, var(--app-color-accent-subtle) 24%, transparent);
}
.cmp-chip.dis{ opacity:.45; cursor:not-allowed; }
.cmp-chip:focus-visible{
  outline:1px solid var(--app-color-focus-ring);
  outline-offset:1px;
}
.cmp-dot{ width:5px; height:5px; border-radius:50%; background:var(--app-color-accent-default); flex:0 0 auto; }
.cmp-chip-body{
  display:flex;
  align-items:center;
  min-width:0;
  flex:1 1 auto;
  overflow:hidden;
}
.cmp-chip-body-text{
  display:flex;
  align-items:center;
  min-width:0;
  width:100%;
  flex:1 1 auto;
  overflow:hidden;
}
.cmp-chip-host{
  width:100%;
  min-width:0;
  max-width:100%;
  flex:1 1 auto;
  overflow:hidden;
  color:var(--app-color-text-secondary);
  font-family:var(--app-font-family-base);
  font-size:var(--cmp-field-control-size);
  line-height:var(--cmp-field-control-line);
}
/* Model 选择器保持统一高度和字体，移除特殊字重 */
.cmp-select-model .cmp-chip-host,
.cmp-select-output-size .cmp-chip-host{
  min-height:var(--cmp-field-control-height);
  align-items:center;
}
.cmp-chip-host > .ui-overlay-icon-button,
.cmp-chip-host > .ui-overlay-icon-layer{
  width:100%;
  min-width:0;
  max-width:100%;
}
.cmp-chip-host > .ui-overlay-icon-layer{
  overflow:hidden;
}
.cmp-chip-host > .cmp-chip:hover ~ .ui-overlay-icon-layer,
.cmp-chip-host > .cmp-chip:focus-visible ~ .ui-overlay-icon-layer{
  color:var(--app-color-text-primary);
}
.cmp-chip-host[data-open="true"] > .ui-overlay-icon-layer{
  color:var(--app-color-accent-default);
}
.cmp-chip-leading-icon{
  flex:0 0 auto;
  color:inherit;
}
.cmp-chip-leading-icon,
.cmp-dot{
  margin-top:0;
  margin-right:6px;
  margin-bottom:0;
  margin-left:0;
}
.cmp-chip-value-icon,
.cmp-chip-value-text{
  display:inline-flex;
  align-items:center;
  min-width:0;
  min-height:16px;
  line-height:16px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  flex:1 1 auto;
  text-align:left;
}
.cmp-chip-value-text{
  display:block;
  flex:1 1 0;
  max-width:100%;
}
.cmp-chip-arrow{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:22px;
  height:20px;
  flex:0 0 auto;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:6px;
  border-radius:50%;
  background:var(--app-color-background-layer-2);
  color:var(--app-color-text-secondary);
}
.cmp-chip.open .cmp-chip-arrow{ color:var(--app-color-text-primary); }
.cmp-chip-chevron{ flex:0 0 auto; color:inherit; }
.cmp-chip-leading-icon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  width:16px;
  min-width:16px;
  height:16px;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
}
.cmp-chip-arrow-text-text{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  width:14px;
  min-width:14px;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:6px;
  color:inherit;
  font-size:0;
  line-height:16px;
  min-height:16px;
  align-self:center;
}
.cmp-chip-arrow-slot-text{
  display:block;
  width:12px;
  min-width:12px;
  height:12px;
}
.cmp-chip-arrow-icon-icon,
.cmp-chip-arrow-icon-text{ flex:0 0 auto; color:inherit; }
.cmp-chip-overlay{
  width:100%;
  min-width:0;
  justify-content:stretch;
}
.cmp-chip-overlay-inner-icon,
.cmp-chip-overlay-inner-text{
  display:flex;
  align-items:center;
  width:100%;
  min-width:0;
  overflow:hidden;
  padding:4px 8px 4px 10px;
}
.cmp-chip-overlay-inner-icon{
  padding:4px 12px 4px 14px;
}
/* 移除 Model 选择器特殊 padding */
.cmp-chip-overlay-value-icon,
.cmp-chip-overlay-value-text{
  display:block;
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  text-align:left;
  min-height:16px;
  line-height:16px;
}
.cmp-chip-leading-proxy-icon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:16px;
  min-width:16px;
  height:16px;
  margin-top:0;
  margin-right:6px;
  margin-bottom:0;
  margin-left:0;
  flex:0 0 auto;
}
/* 移除 Model 图标特殊尺寸 */
.cmp-chip-overlay-spacer-icon,
.cmp-chip-overlay-spacer-text{
  display:block;
  flex:1 1 auto;
  min-width:0;
}
.cmp-chip-a11y-value-icon{
  display:block;
  width:1px;
  height:1px;
  overflow:hidden;
  opacity:0;
  pointer-events:none;
}
.cmp-chip-a11y-value-text{
  display:block;
  width:1px;
  height:1px;
  overflow:hidden;
  opacity:0;
  pointer-events:none;
}
.cmp-chip-arrow-proxy-icon,
.cmp-chip-arrow-proxy-text{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:14px;
  min-width:14px;
  min-height:16px;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:6px;
  color:inherit;
  flex:0 0 auto;
}
/* 移除 Model 箭头图标特殊尺寸 */
.cmp-select-model .cmp-chip{ width:100%; min-width:0; }
.cmp-select-model .cmp-chip-value-icon,
.cmp-select-model .cmp-chip-value-text{
  display:block;
  min-width:0;
  max-width:100%;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.cmp-select-output-size .cmp-chip-body-icon{
  justify-content:flex-start;
}
.cmp-select-output-size .cmp-chip-value-icon{
  overflow:visible;
  text-overflow:clip;
  white-space:nowrap;
}
.cmp-sp{ flex:1; min-width:0; }
.cmp-opt-icon-button{
  width:30px;
  height:30px;
  min-width:30px;
  min-height:30px;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:0;
  padding:0;
  border-radius:999px;
  color:var(--app-color-text-secondary);
  background:transparent;
  flex:0 0 auto;
}
/* Model 选择器保留透明背景和边框色，移除字重覆盖 */
.cmp-select-model .cmp-chip-icon,
.cmp-select-output-size .cmp-chip-icon{
  border-color:color-mix(in srgb, var(--app-color-border-default) 46%, transparent);
}
.cmp-select-model .cmp-chip-leading-proxy-icon,
.cmp-select-output-size .cmp-chip-leading-proxy-icon{
  color:var(--app-color-text-muted);
}
.cmp-select-model .cmp-chip-arrow-proxy-icon,
.cmp-select-output-size .cmp-chip-arrow-proxy-icon{
  color:color-mix(in srgb, var(--app-color-text-muted) 68%, transparent);
}
.cmp-select-model .cmp-chip-host[data-open="true"] .cmp-chip-leading-proxy-icon,
.cmp-select-output-size .cmp-chip-host[data-open="true"] .cmp-chip-leading-proxy-icon,
.cmp-select-model .cmp-chip-host[data-open="true"] .cmp-chip-arrow-proxy-icon,
.cmp-select-output-size .cmp-chip-host[data-open="true"] .cmp-chip-arrow-proxy-icon{
  color:var(--app-color-accent-default);
}
.cmp-capture,
.cmp-mask-toggle{
  width:30px;
  height:30px;
  min-width:30px;
  min-height:30px;
  margin-top:0;
  margin-bottom:0;
  margin-left:0;
  padding:0;
  border-radius:999px;
  color:var(--app-color-text-secondary);
  background:transparent;
  flex:0 0 auto;
}
.cmp-capture-icon{
  display:block;
  flex:0 0 auto;
}
.cmp-capture-host{
  margin-top:0;
  margin-right:8px;
  margin-bottom:0;
  margin-left:0;
}
.cmp-opt-icon{
  display:block;
  flex:0 0 auto;
}
/* 发送操作由 Spectrum command button 绘制；此处只保留布局。 */
.send-wrap{ display:flex; align-items:stretch; flex-shrink:0; }
.cmp-send{
  width:32px; height:32px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
}
.cmp-send-host{
  width:32px;
  height:32px;
}
.cmp-send-overlay{
  align-items:center;
  justify-content:center;
  padding:0;
}
.cmp-bottom{ min-width:0; }
`;

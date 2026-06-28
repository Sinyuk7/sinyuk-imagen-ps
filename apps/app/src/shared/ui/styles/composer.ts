/** Composer：底部输入区、chip 触发器、select 菜单、附件、图层列表。 */
export const COMPOSER_CSS = `
.composer{
  flex-shrink:0; padding:8px 12px 12px; background:var(--app-color-background-base);
  border-top:1px solid var(--app-color-border-default); position:relative;
  max-height:min(42%, 260px); overflow:visible;
}

/* Attachment row */
.attach-row{
  display:flex; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; flex-wrap:nowrap;
}
.attach-row::-webkit-scrollbar{ display:none; }
.att-thumb{
  position:relative; width:52px; height:52px; margin-right:6px; border-radius:8px;
  overflow:hidden; border:1px solid var(--app-color-border-default); flex-shrink:0;
}
.att-rm{
  position:absolute; top:2px; right:2px; width:16px; height:16px; border-radius:50%;
  background:rgba(0,0,0,.75); color:white; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; font-size:11px; line-height:1;
}
.att-rm:hover{ background:var(--app-color-negative); }

/* Header profile menu (absolute) —— 默认对齐 header center 区域；
 * 窄面板时由 responsive root mode 收敛到 panel 内 full-width containment。 */
.model-menu{
  position:absolute; top:52px; left:84px; right:12px;
  background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-strong); border-radius:var(--app-radius-medium);
  overflow-y:auto; min-width:140px; max-height:240px; z-index:200;
}
.model-opt{
  padding:8px 12px; font-family:var(--app-font-family-mono); font-size:12px; color:var(--app-color-text-secondary);
  cursor:pointer; display:flex; align-items:center;
}
.model-opt [data-icon]{ margin-right:8px; }
.model-opt:hover{ background:var(--app-color-hover-overlay); color:var(--app-color-text-primary); }
.model-opt.act{ color:var(--app-color-accent-default); }

/* Attach picker */
.attach-picker{
  position:absolute; bottom:calc(100% + 4px); left:12px;
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

/* Layer list */
.layer-list-wrap{
  position:absolute; bottom:calc(100% + 4px); left:12px;
  background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-strong); border-radius:var(--app-radius-medium);
  overflow:hidden; width:230px; max-width:calc(100% - 24px); max-height:240px; z-index:201;
  display:flex; flex-direction:column;
}
.layer-list-hdr{
  padding:7px 12px; font-size:10px; font-weight:600; color:var(--app-color-text-muted);
  letter-spacing:.5px; border-bottom:1px solid var(--app-color-border-default);
  display:flex; align-items:center;
}
.layer-back{ margin-top:0; margin-right:8px; margin-bottom:0; margin-left:0; background:transparent; border:none; color:var(--app-color-text-muted); cursor:pointer; display:flex; align-items:center; }
.layer-refresh{ margin-left:auto; background:transparent; border:none; color:var(--app-color-text-muted); cursor:pointer; display:flex; align-items:center; }
.layer-scroll{ max-height:190px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--app-color-border-default) transparent; }
.layer-scroll::-webkit-scrollbar{ width:3px; }
.layer-item{
  display:flex; align-items:center; padding:5px 12px;
  cursor:pointer; border-bottom:1px solid var(--app-color-border-default);
}
.layer-item:last-child{ border-bottom:none; }
.layer-item:hover{ background:var(--app-color-hover-overlay); }
.layer-swatch{ width:24px; height:24px; margin-right:8px; border-radius:4px; flex-shrink:0; border:1px solid var(--app-color-border-default); }
.layer-name{ font-size:12px; color:var(--app-color-text-primary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.layer-meta-lbl{ font-family:var(--app-font-family-mono); font-size:9px; color:var(--app-color-text-muted); white-space:nowrap; }

/* Composer shell */
.cmp-shell{
  width:100%;
  display:flex;
  flex-direction:column;
  max-height:100%;
  min-height:0;
}
.cmp-shell.off{ opacity:.38; pointer-events:none; }
.cmp-attach-band{ display:flex; flex-direction:column; flex:0 0 auto; }
.cmp-core{
  width:100%; background:var(--app-color-background-layer-2); border:1px solid var(--app-color-border-default); border-radius:var(--app-radius-large);
  padding:9px 10px 8px; display:flex; flex-direction:column; flex:0 1 auto; min-height:0;
}
.cmp-core:focus-within{ border-color:var(--app-color-border-strong); }
.cmp-body{ display:flex; flex-direction:column; min-height:0; }
.cmp-action-row,
.cmp-toolbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  min-width:0;
}
.cmp-action-row{ flex-wrap:nowrap; margin-top:8px; }
.cmp-toolbar{ padding:4px 2px 0; flex-wrap:wrap; align-items:flex-start; flex:0 0 auto; }
.cmp-action-left,
.cmp-toolbar-left{
  display:flex;
  align-items:center;
  min-width:0;
  flex:1 1 auto;
  overflow:visible;
}
.cmp-action-right,
.cmp-toolbar-right{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  min-width:0;
  flex:0 0 auto;
  overflow:visible;
}
.cmp-toolbar-left{ margin-right:6px; margin-bottom:4px; }
.cmp-toolbar-right{ margin-bottom:4px; }
.cmp-select{ position:relative; display:flex; align-items:center; min-width:0; flex-shrink:1; }
.cmp-select-model{ flex:1 1 142px; min-width:112px; }
.cmp-select-target{ flex:0 1 92px; min-width:74px; }
.cmp-select-aspect{ flex:0 1 80px; min-width:70px; }
.cmp-select-target{ margin-right:6px; }
.cmp-select-menu{
  position:absolute; left:0; bottom:calc(100% + 6px); z-index:200;
  min-width:0; max-width:320px; background:var(--app-color-background-elevated); border:1px solid var(--app-color-border-strong); border-radius:var(--app-radius-small);
  overflow:hidden;
}
.cmp-select-menu::-webkit-scrollbar{ width:3px; }
.cmp-select-menu::-webkit-scrollbar-thumb{ background:var(--app-color-border-default); border-radius:2px; }
.cmp-select-menu-down{ top:calc(100% + 6px); bottom:auto; }
.cmp-select-menu-up{ top:auto; bottom:calc(100% + 6px); }
.cmp-select-menu-start{ left:0; right:auto; }
.cmp-select-menu-end{ left:auto; right:0; }
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
  min-height:28px;
  margin-top:0;
  margin-right:0;
  margin-bottom:2px;
  margin-left:0;
  padding:5px 7px;
  border-radius:6px;
  border:none;
  background:transparent;
  color:var(--app-color-text-secondary);
  cursor:pointer;
  font-family:var(--app-font-family-mono);
  font-size:10px;
  line-height:14px;
  text-align:left;
}
.cmp-select-option:last-child{ margin-bottom:0; }
.cmp-select-option:hover,
.cmp-select-option:focus-visible{
  background:var(--app-color-hover-overlay);
  color:var(--app-color-text-primary);
  outline:none;
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
.cmp-select-option-label{
  display:block;
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.cmp-select-option-check{
  flex:0 0 auto;
  margin-top:0;
  margin-right:0;
  margin-bottom:0;
  margin-left:8px;
  color:var(--app-color-accent-default);
}
.cmp-ta{
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  display:block; appearance:none; -webkit-appearance:none;
  background:transparent; background-color:transparent; border:none; outline:none;
  color:var(--app-color-text-primary); font-family:var(--app-font-family-base); font-size:13px; line-height:18px;
  resize:none; min-height:34px; max-height:72px; overflow-y:auto; padding:0;
  scrollbar-width:thin; width:100%;
}
.cmp-ta::placeholder{ color:var(--app-color-text-muted); }

/* + attach button */
.cmp-add{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; color:var(--app-color-text-secondary); flex-shrink:0;
}

/* Model chip (native dropdown trigger) */
.cmp-chip{
  display:flex; align-items:center;
  min-width:0; max-width:100%; width:100%;
  margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;
  min-height:28px; padding:4px 8px 4px 10px; border-radius:var(--app-radius-pill);
  border:1px solid var(--app-color-border-default); background:var(--app-color-background-layer-1);
  font-family:var(--app-font-family-mono); font-size:10px; line-height:14px; color:var(--app-color-text-secondary);
  cursor:pointer; white-space:nowrap; user-select:none; flex-shrink:1;
}
.cmp-chip:hover{ border-color:var(--app-color-border-strong); color:var(--app-color-text-primary); }
.cmp-chip.open{ border-color:var(--app-color-accent-default); color:var(--app-color-accent-default); }
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
.cmp-chip-leading{ flex:0 0 auto; color:inherit; }
.cmp-chip-leading,
.cmp-dot{
  margin-top:0;
  margin-right:6px;
  margin-bottom:0;
  margin-left:0;
}
.cmp-chip-value{
  display:block;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  flex:1 1 auto;
  text-align:left;
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
.cmp-select-model .cmp-chip{ width:100%; min-width:0; }
.cmp-sp{ flex:1; min-width:0; }
.cmp-opt{
  display:inline-flex; align-items:center; justify-content:center;
  margin-top:0; margin-right:6px; margin-bottom:0; margin-left:0; color:var(--app-color-text-secondary); flex-shrink:0;
}

/* Send button (native, e2e checks HTMLButtonElement) */
.send-wrap{ display:flex; align-items:stretch; border-radius:50%; overflow:hidden; flex-shrink:0; }
.cmp-send{
  width:32px; height:32px; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; border:none;
  border-radius:50%;
  background:var(--app-color-accent-default); color:var(--app-color-text-on-accent); cursor:pointer;
  display:flex; align-items:center; justify-content:center;
}
.cmp-send:hover{ background:var(--app-color-accent-hover); }
.cmp-send:active{ background:var(--app-color-accent-down); }
.cmp-send:disabled{ opacity:.35; cursor:not-allowed; }
.cmp-bottom{ min-width:0; }
`;

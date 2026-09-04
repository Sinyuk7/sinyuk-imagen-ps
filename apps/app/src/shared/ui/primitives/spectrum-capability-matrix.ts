/** 当前 runtime 能力矩阵；声明文件不等于已注册或已通过宿主验证。 */
export const SPECTRUM_CAPABILITY_MATRIX = [
  { tag: 'sp-button', source: 'swc', installed: true, registered: true, hostGate: true },
  { tag: 'sp-action-button', source: 'swc', installed: true, registered: true, hostGate: true },
  { tag: 'sp-textfield', source: 'swc', installed: true, registered: true, hostGate: true },
  { tag: 'sp-textarea', source: 'uxp-widget', installed: false, registered: false, hostGate: true },
  { tag: 'sp-checkbox', source: 'uxp-widget', installed: false, registered: false, hostGate: true },
  { tag: 'sp-radio', source: 'uxp-widget', installed: false, registered: false, hostGate: true },
  { tag: 'sp-menu', source: 'uxp-widget', installed: false, registered: false, hostGate: true },
  { tag: 'sp-menu-item', source: 'uxp-widget', installed: false, registered: false, hostGate: true },
  { tag: 'sp-popover', source: 'uxp-widget', installed: false, registered: false, hostGate: true },
] as const;

export type SpectrumCapabilityTag = (typeof SPECTRUM_CAPABILITY_MATRIX)[number]['tag'];

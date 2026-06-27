import { createElement, type CSSProperties, type ReactElement } from 'react';

import '@spectrum-web-components/icons-workflow/icons/sp-icon-add.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-alert-circle.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-arrow-right.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-checkmark.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-chevron-down.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-chevron-left.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-chevron-right.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-copy.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-delete.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-drag-handle.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-download.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-file-add.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-history.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-image-add.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-image-auto-mode.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-layers.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-magic-wand.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-move-left-right.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-redo.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-refresh.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-selection.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-send.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-settings.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-visibility-off.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-visibility.js';

/**
 * @imagen-ps/app 图标调用合同。
 *
 * Shared UI 继续只通过业务语义名称调用图标；具体图形使用 SWC workflow
 * icon 的按需 custom element 注册，避免重新引入自制 PNG 或全量图标库。
 */

export type IconName =
  | 'add'
  | 'arrow-right'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'compare-handle'
  | 'copy'
  | 'download'
  | 'error'
  | 'eye'
  | 'eye-off'
  | 'history'
  | 'image-auto-mode'
  | 'magic-wand'
  | 'place-ps'
  | 'ps-layers'
  | 'refresh'
  | 'regenerate'
  | 'selection'
  | 'send'
  | 'settings'
  | 'spinner'
  | 'trash'
  | 'upload';

interface IconProps {
  /** 图标名称，必须在 IconName 联合类型中定义。 */
  readonly name: IconName;
  /** 图标尺寸，默认 14。 */
  readonly size?: number;
  /** 自定义样式。 */
  readonly style?: CSSProperties;
  /** 自定义类名。 */
  readonly className?: string;
}

const ICON_TAG_BY_NAME: Record<IconName, string> = {
  add: 'sp-icon-add',
  'arrow-right': 'sp-icon-arrow-right',
  check: 'sp-icon-checkmark',
  'chevron-down': 'sp-icon-chevron-down',
  'chevron-left': 'sp-icon-chevron-left',
  'chevron-right': 'sp-icon-chevron-right',
  'compare-handle': 'sp-icon-drag-handle',
  copy: 'sp-icon-copy',
  download: 'sp-icon-download',
  error: 'sp-icon-alert-circle',
  eye: 'sp-icon-visibility',
  'eye-off': 'sp-icon-visibility-off',
  history: 'sp-icon-history',
  'image-auto-mode': 'sp-icon-image-auto-mode',
  'magic-wand': 'sp-icon-magic-wand',
  'place-ps': 'sp-icon-image-add',
  'ps-layers': 'sp-icon-layers',
  refresh: 'sp-icon-refresh',
  regenerate: 'sp-icon-redo',
  selection: 'sp-icon-selection',
  send: 'sp-icon-send',
  settings: 'sp-icon-settings',
  spinner: 'sp-icon-refresh',
  trash: 'sp-icon-delete',
  upload: 'sp-icon-file-add',
};

/**
 * 渲染已按需注册的 SWC workflow icon。
 *
 * @param props.name - 图标名称
 * @param props.size - 渲染尺寸
 * @param props.style - 额外样式
 * @param props.className - 额外类名
 */
export function Icon({ name, size = 14, style, className }: IconProps): ReactElement {
  return createElement(ICON_TAG_BY_NAME[name], {
    'aria-hidden': 'true',
    className,
    'data-icon': ICON_TAG_BY_NAME[name],
    'data-icon-name': name,
    slot: 'icon',
    style: {
      color: 'inherit',
      display: 'block',
      flexShrink: 0,
      height: size,
      width: size,
      ...style,
    },
  });
}

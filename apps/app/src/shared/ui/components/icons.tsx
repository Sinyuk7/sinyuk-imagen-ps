/**
 * @imagen-ps/app UXP 面板图标注册表
 *
 * 之前使用 inline SVG（stroke-only Lucide 风格）的按钮图标在真实 Photoshop/UXP host
 * 中经常渲染为 0x0 或完全不可见。该模块将所有图标放到 public/assets/icons/
 * 下作为静态资源，代码只维护一个名称到文件路径的映射。
 *
 * 第一版使用 PNG 占位图，后续可以直接替换同名文件而无需修改 JSX。
 *
 * @see docs/dev-memory/memories/bug/uxp-inline-svg-icons.md
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
  | 'place-ps'
  | 'ps-layers'
  | 'refresh'
  | 'regenerate'
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
  readonly style?: React.CSSProperties;
  /** 自定义类名。 */
  readonly className?: string;
}

const ICON_BASE_PATH = './assets/icons';

/**
 * UXP 安全的图标组件，使用经过打包的静态 PNG 资源。
 *
 * @param props.name - 图标名称
 * @param props.size - 渲染尺寸
 * @param props.style - 额外样式
 * @param props.className - 额外类名
 */
export function Icon({ name, size = 14, style, className }: IconProps) {
  return (
    <img
      src={`${ICON_BASE_PATH}/${name}.png`}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      draggable={false}
    />
  );
}

/**
 * 获取图标的静态资源 URL，用于需要直接使用 <img> 之外场景。
 *
 * @param name - 图标名称
 * @returns 相对于当前页面的图标 URL
 */
export function iconUrl(name: IconName): string {
  return `${ICON_BASE_PATH}/${name}.png`;
}

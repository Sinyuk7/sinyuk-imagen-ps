import type { CSSProperties, ReactElement, SVGProps } from 'react';

/**
 * @imagen-ps/app 图标调用合同。
 *
 * Shared UI 只通过业务语义名称调用图标；底层输出普通 inline SVG，
 * 避免 Photoshop UXP 中 workflow icon custom element 的首帧几何不稳定。
 */
export type IconName =
  | 'add'
  | 'algorithm'
  | 'arrow-right'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'copy'
  | 'download'
  | 'error'
  | 'eye'
  | 'eye-off'
  | 'history'
  | 'info'
  | 'image-auto-mode'
  | 'image-check'
  | 'magic-wand'
  | 'message'
  | 'pencil'
  | 'place-ps'
  | 'plug'
  | 'ps-layers'
  | 'refresh'
  | 'regenerate'
  | 'selection'
  | 'send'
  | 'settings'
  | 'spinner'
  | 'star'
  | 'target'
  | 'trash'
  | 'upload'
  | 'warning'
  | 'layer-pixel'
  | 'layer-smart-object'
  | 'layer-text'
  | 'layer-group';

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

type SvgBody = (props: SVGProps<SVGSVGElement>) => ReactElement;

const ICON_BODY_BY_NAME: Record<IconName, SvgBody> = {
  add: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  algorithm: () => (
    <>
      <circle cx="12" cy="5.5" r="2.2" />
      <circle cx="5.5" cy="17.5" r="2.2" />
      <circle cx="18.5" cy="17.5" r="2.2" />
      <circle cx="12" cy="19.5" r="2.2" />
      <path d="M10.9 7.4L7 15.6" />
      <path d="M13.1 7.4l3.9 8.2" />
      <path d="M8 17.5h8" />
      <path d="M12 17.3v0" />
    </>
  ),
  'arrow-right': () => (
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="14 7 19 12 14 17" />
    </>
  ),
  check: () => <polyline points="5 12.5 9.4 17 19 7" />,
  'chevron-down': () => <polyline points="6 9 12 15 18 9" />,
  'chevron-left': () => <polyline points="15 5 8 12 15 19" />,
  'chevron-right': () => <polyline points="9 5 16 12 9 19" />,
  close: () => (
    <>
      <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
      <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
    </>
  ),
  copy: () => (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15V7c0-1.1.9-2 2-2h8" />
    </>
  ),
  download: () => (
    <>
      <path d="M12 4v10" />
      <polyline points="8 10 12 14 16 10" />
      <path d="M5 19h14" />
    </>
  ),
  error: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7" x2="12" y2="13" />
      <circle cx="12" cy="17" r="1" />
    </>
  ),
  eye: () => (
    <>
      <path d="M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12s-3 5.5-8.5 5.5S3.5 12 3.5 12" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  'eye-off': () => (
    <>
      <path d="M4 4l16 16" />
      <path d="M8.4 8.4C5.5 9.7 3.5 12 3.5 12s3 5.5 8.5 5.5c1.3 0 2.5-.3 3.5-.8" />
      <path d="M12.8 6.6C17.8 7.1 20.5 12 20.5 12s-.8 1.5-2.2 2.9" />
    </>
  ),
  history: () => (
    <>
      <path d="M5 8V4" />
      <path d="M5 8h4" />
      <path d="M5.6 8.2A7 7 0 1 1 4.9 14" />
      <polyline points="12 8 12 12.5 15 14" />
    </>
  ),
  info: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="10.5" x2="12" y2="16.5" />
      <circle cx="12" cy="7.4" r="1" />
    </>
  ),
  'image-auto-mode': () => (
    <>
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path d="M7 14l3-3 2 2 2.5-3 2.5 4" />
      <path d="M17.5 3.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7.7-1.5z" />
    </>
  ),
  'image-check': () => (
    <>
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path d="M7 14l3-3 2 2 2.5-3 2.5 4" />
      <polyline points="14 5 16 7 20 3" />
    </>
  ),
  'magic-wand': () => (
    <>
      <path d="M5 19L19 5" />
      <path d="M14 4l6 6" />
      <path d="M5 5h2" />
      <path d="M6 4v2" />
      <path d="M18 17h2" />
      <path d="M19 16v2" />
    </>
  ),
  message: () => (
    <>
      <path d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
    </>
  ),
  pencil: () => (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </>
  ),
  plug: () => (
    <>
      <path d="M11 2v6" />
      <path d="M13 2v6" />
      <path d="M12 8v13" />
      <path d="M7 8h10" />
      <path d="M16 16l3 3" />
    </>
  ),
  'place-ps': () => (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M7 15l3-3 2 2 2.5-3 2.5 4" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="9.5" y1="10.5" x2="14.5" y2="10.5" />
    </>
  ),
  'ps-layers': () => (
    <>
      <path d="M12 3l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 17l8 4 8-4" />
    </>
  ),
  refresh: () => (
    <>
      <path d="M19 8a7 7 0 0 0-12-2l-2 2" />
      <polyline points="5 4 5 8 9 8" />
      <path d="M5 16a7 7 0 0 0 12 2l2-2" />
      <polyline points="19 20 19 16 15 16" />
    </>
  ),
  regenerate: () => (
    <>
      <path d="M19 8a7 7 0 0 0-12-2l-2 2" />
      <polyline points="5 4 5 8 9 8" />
      <path d="M5 16a7 7 0 0 0 12 2l2-2" />
      <polyline points="19 20 19 16 15 16" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  selection: () => (
    <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" strokeDasharray="3.5 2.5" />
  ),
  send: () => (
    <>
      <path d="M21 4L10 15" />
      <path d="M21 4l-7 17-4-6-6-4 17-7z" />
    </>
  ),
  settings: () => (
    <>
      <polygon points="12,1.5 14.2,6.6 19.5,4.5 18,9.9 22.5,12 18,14.1 19.5,19.5 14.2,17.4 12,22.5 9.8,17.4 4.5,19.5 6,14.1 1.5,12 6,9.9 4.5,4.5 9.8,6.6" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  spinner: () => (
    <path d="M12 3a9 9 0 0 1 9 9" strokeDasharray="42 14" />
  ),
  star: () => (
    <>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </>
  ),
  target: () => (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
    </>
  ),
  trash: () => (
    <>
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M8 10v9" />
      <path d="M12 10v9" />
      <path d="M16 10v9" />
      <path d="M7 7l1 14h8l1-14" />
    </>
  ),
  upload: () => (
    <>
      <path d="M12 20V9" />
      <polyline points="8 13 12 9 16 13" />
      <path d="M5 20h14" />
      <path d="M6 4h12v4" />
    </>
  ),
  warning: () => (
    <>
      <path d="M12 4.5l8 14H4l8-14z" />
      <line x1="12" y1="9.5" x2="12" y2="13.5" />
      <circle cx="12" cy="16.5" r="1" />
    </>
  ),
  'layer-pixel': () => (
    <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" />
  ),
  'layer-smart-object': () => (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <circle cx="16.5" cy="16.5" r="2.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" />
    </>
  ),
  'layer-text': () => (
    <>
      <path d="M7 7h10" />
      <path d="M12 7v10" />
      <path d="M9 17h6" />
    </>
  ),
  'layer-group': () => (
    <>
      <path d="M5 8h14" />
      <path d="M6 8v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
      <path d="M8 5h8v3H8z" />
    </>
  ),
};

/**
 * 渲染项目自有 inline SVG 图标。
 *
 * @param props.name - 图标名称
 * @param props.size - 渲染尺寸
 * @param props.style - 额外样式
 * @param props.className - 额外类名
 */
export function Icon({ name, size = 14, style, className }: IconProps): ReactElement {
  const Body = ICON_BODY_BY_NAME[name];
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-icon={`icon-${name}`}
      data-icon-name={name}
      focusable="false"
      height={size}
      style={{ color: 'inherit', display: 'block', flexShrink: 0, ...style }}
      viewBox="0 0 24 24"
      width={size}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        <Body />
      </g>
    </svg>
  );
}

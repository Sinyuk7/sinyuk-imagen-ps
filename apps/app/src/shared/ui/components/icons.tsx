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
  | 'aspect-ratio'
  | 'arrow-right'
  | 'capture-selection'
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
  | 'image-size'
  | 'magic-wand'
  | 'message'
  | 'network'
  | 'pencil'
  | 'place-ps'
  | 'plug'
  | 'ps-layers'
  | 'question'
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
  /* ── Layout grid ───────────────────────────────────────────────── */
  add: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  'arrow-right': () => (
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="14 7 19 12 14 17" />
    </>
  ),
  check: () => <polyline points="5 12.5 9.4 17 19 7" />,
  close: () => (
    <>
      <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
      <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
    </>
  ),

  /* ── Chevron family — shared skeleton 7×14 ─────────────────────── */
  'chevron-down': () => <polyline points="6 8.5 12 14.5 18 8.5" strokeWidth="2.2" />,
  'chevron-left': () => <polyline points="15 5 8 12 15 19" />,
  'chevron-right': () => <polyline points="9 5 16 12 9 19" />,

  /* ── Status family — shared circle(r=9) base ───────────────────── */
  error: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7" x2="12" y2="13" />
      <circle cx="12" cy="17" r="1" />
    </>
  ),
  info: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="10.5" x2="12" y2="16.5" />
      <circle cx="12" cy="7.4" r="1" />
    </>
  ),
  warning: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.5" r="1" />
    </>
  ),

  /* ── Eye family ────────────────────────────────────────────────── */
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

  /* ── Transfer family — download / upload ───────────────────────── */
  download: () => (
    <>
      <path d="M12 5v9" />
      <polyline points="8.5 10.5 12 14 15.5 10.5" />
      <path d="M5 19h14" />
    </>
  ),
  upload: () => (
    <>
      <path d="M12 19V10" />
      <polyline points="8.5 13.5 12 10 15.5 13.5" />
      <path d="M5 19h14" />
      <path d="M6 5h12v3" />
    </>
  ),

  /* ── Refresh family — shared circular-arrows skeleton ──────────── */
  refresh: () => (
    <>
      <path d="M19 9a7 7 0 0 0-12-2l-2 2" />
      <polyline points="5 5 5 9 9 9" />
      <path d="M5 15a7 7 0 0 0 12 2l2-2" />
      <polyline points="19 19 19 15 15 15" />
    </>
  ),
  regenerate: () => (
    <>
      <path d="M19 9a7 7 0 0 0-12-2l-2 2" />
      <polyline points="5 5 5 9 9 9" />
      <path d="M5 15a7 7 0 0 0 12 2l2-2" />
      <polyline points="19 19 19 15 15 15" />
      <path d="M15.5 4.5l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" />
    </>
  ),
  spinner: () => (
    <path d="M12 3a9 9 0 0 1 9 9" strokeDasharray="42 14" />
  ),

  /* ── Image family ──────────────────────────────────────────────── */
  'image-auto-mode': () => (
    <>
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path d="M7 14l3-3 2 2 2.5-3 2.5 4" />
      <path d="M17.5 3.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7.7-1.5z" />
    </>
  ),
  'image-size': () => (
    <>
      <path d="M8 4H5v3" />
      <path d="M16 4h3v3" />
      <path d="M5 17v3h3" />
      <path d="M19 17v3h-3" />
      <rect x="7" y="8" width="10" height="8" rx="1.8" />
      <path d="M9 13.5l2-2 1.6 1.6 2.4-3.1 2 3.5" />
      <circle cx="10" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  'aspect-ratio': () => (
    <>
      <rect x="4.5" y="6" width="15" height="12" rx="2" />
      <path d="M9 9H6.5v2.8" />
      <path d="M15 15h2.5v-2.8" />
    </>
  ),
  'image-check': () => (
    <>
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path d="M7 14l3-3 2 2 2.5-3 2.5 4" />
      <polyline points="14 5 16 7 20 3" />
    </>
  ),
  'place-ps': () => (
    <>
      <rect x="4.5" y="6.5" width="10" height="12" rx="2" />
      <path d="M10 14l8.5-8.5" />
      <polyline points="13.5 5.5 18.5 5.5 18.5 10.5" />
    </>
  ),

  /* ── Layer family — shared rect(5,5 14×14 rx=2) frame ─────────── */
  'layer-pixel': () => (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
      <line x1="5" y1="9" x2="19" y2="9" />
      <line x1="5" y1="15" x2="19" y2="15" />
    </>
  ),
  'layer-smart-object': () => (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M16 11.5v-3a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h3" />
    </>
  ),
  'layer-text': () => (
    <>
      <path d="M6 7h12" />
      <path d="M12 7v10" />
      <path d="M8.5 17h7" />
    </>
  ),
  'layer-group': () => (
    <>
      <path d="M5 8h14" />
      <path d="M6 8v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
      <path d="M8 5h8v3H8z" />
    </>
  ),

  /* ── Selection ─────────────────────────────────────────────────── */
  selection: () => (
    <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" strokeDasharray="3.5 2.5" />
  ),
  'capture-selection': () => (
    <>
      <path d="M8 5H5v3" />
      <path d="M16 5h3v3" />
      <path d="M5 16v3h3" />
      <path d="M16 19h3v-3" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),

  /* ── Action / tool icons ───────────────────────────────────────── */
  copy: () => (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15V7c0-1.1.9-2 2-2h8" />
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
  message: () => (
    <path d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
  ),
  question: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.5 2.5 0 0 1 5 0c0 1.8-1.8 2.4-2.5 3.7" />
      <circle cx="12" cy="17" r="1" />
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
  send: () => (
    <>
      <path d="M21 4L10 15" />
      <path d="M21 4l-7 17-4-6-6-4 17-7z" />
    </>
  ),
  settings: () => (
    <>
      <circle cx="12" cy="12" r="6.3" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.2v2.2" />
      <path d="M12 18.6v2.2" />
      <path d="M3.2 12h2.2" />
      <path d="M18.6 12h2.2" />
      <path d="M5.8 5.8l1.6 1.6" />
      <path d="M16.6 16.6l1.6 1.6" />
      <path d="M18.2 5.8l-1.6 1.6" />
      <path d="M7.4 16.6l-1.6 1.6" />
    </>
  ),
  'magic-wand': () => (
    <>
      <path d="M5 19L19 5" strokeWidth="2.5" />
      <path d="M14 4l6 6" strokeWidth="2.3" />
      <path d="M5 5h2.5" strokeWidth="2.3" />
      <path d="M6.25 3.75v2.5" strokeWidth="2.3" />
      <path d="M17.5 17.5h2.5" strokeWidth="2.3" />
      <path d="M18.75 16.25v2.5" strokeWidth="2.3" />
    </>
  ),
  trash: () => (
    <>
      <path d="M5 8h14" />
      <path d="M9 8V6h6v2" />
      <path d="M8 11v8" />
      <path d="M12 11v8" />
      <path d="M16 11v8" />
      <path d="M7 8l1 13h8l1-13" />
    </>
  ),

  /* ── Algorithm / network ───────────────────────────────────────── */
  algorithm: () => (
    <>
      <circle cx="12" cy="5.5" r="2.2" />
      <circle cx="5.5" cy="17.5" r="2.2" />
      <circle cx="18.5" cy="17.5" r="2.2" />
      <circle cx="12" cy="19.5" r="2.2" />
      <path d="M10.9 7.4L7 15.6" />
      <path d="M13.1 7.4l3.9 8.2" />
      <path d="M8 17.5h8" />
    </>
  ),
  network: () => (
    <>
      <path d="M4.5 10.5a11.2 11.2 0 0 1 15 0" />
      <path d="M7.5 13.5a6.7 6.7 0 0 1 9 0" />
      <path d="M10.4 16.4a2.4 2.4 0 0 1 3.2 0" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),

  /* ── Layers panel ──────────────────────────────────────────────── */
  'ps-layers': () => (
    <>
      <path d="M12 4l8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 17l8 4 8-4" />
    </>
  ),

  /* ── Misc ──────────────────────────────────────────────────────── */
  star: () => (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

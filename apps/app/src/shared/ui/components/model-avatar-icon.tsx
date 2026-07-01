import type { CSSProperties, ReactElement } from 'react';
import { MODEL_AVATAR_SVG_BY_NAME, type ModelAvatarIconName } from './generated/model-avatar-icons';

interface ModelAvatarIconProps {
  readonly name: ModelAvatarIconName;
  readonly size?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function ModelAvatarIcon({
  name,
  size = 16,
  className,
  style,
}: ModelAvatarIconProps): ReactElement {
  const svg = MODEL_AVATAR_SVG_BY_NAME[name];
  return (
    <span
      aria-hidden="true"
      className={className}
      data-model-avatar-icon={name}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        color: 'currentColor',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
      // 素材由本仓库资产生成脚本输出，并强制改成单色 currentColor。
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

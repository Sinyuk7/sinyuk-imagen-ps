import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ActionButton, Button } from './native-controls';
import { OverlayControlShell } from '../components/overlay-controls';

type IconButtonVariant = 'action' | 'accent' | 'primary' | 'secondary' | 'negative';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> {
  /** 按钮视觉变体；'action' 为无边框工具按钮，其他值对应 `<Button variant>`。 */
  readonly variant?: IconButtonVariant;
  /** 是否使用 quiet 样式（仅 action 变体有效）。 */
  readonly quiet?: boolean;
  /** 是否强调（仅 action 变体有效）。 */
  readonly emphasized?: boolean;
  /** 是否处于选中状态（仅 action 变体有效）。 */
  readonly selected?: boolean;
  /** 是否为切换按钮（仅 action 变体有效）。 */
  readonly toggles?: boolean;
  /** 图标节点，通常传入 `<Icon name="..." />`；不传时渲染纯文本按钮。 */
  readonly icon?: ReactNode;
  /** 按钮内显示的文字；为空时只显示图标。 */
  readonly text?: string;
  /** tooltip / aria-label / title 文案。 */
  readonly tooltip?: string;
  /** tooltip 位置（仅 action 变体有效）。 */
  readonly placement?: 'top' | 'top-start' | 'top-end' | 'right' | 'right-start' | 'right-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end';
  /** 图标占位尺寸（px），默认 14。 */
  readonly iconSize?: number;
  /** 是否使用紧凑正方形图标按钮盒模型。 */
  readonly compactSquare?: boolean;
  readonly hostClassName?: string;
  readonly overlayClassName?: string;
}

function classNames(...parts: Array<string | undefined | false>): string | undefined {
  const value = parts.filter(Boolean).join(' ');
  return value || undefined;
}

/**
 * 通用图标按钮。
 *
 * 在 Photoshop UXP 里，button 内部直接放 SVG 图标可能会塌成 0×0，
 * 所以这里把图标提升到 button 的兄弟 overlay 层，button 内部只保留
 * 一个等大的占位 slot 和可选文字，保证布局稳定。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'action',
    quiet,
    emphasized,
    selected,
    toggles,
    icon,
    text,
    tooltip,
    placement,
    iconSize = 14,
    compactSquare = false,
    className,
    hostClassName,
    overlayClassName,
    style,
    ...props
  },
  ref,
) {
  const hasIcon = Boolean(icon);
  const rootStyle: CSSProperties = {
    '--ui-icon-button-size': `${iconSize}px`,
    ...style,
  } as CSSProperties;
  const buttonClassName = classNames(
    'ui-icon-button',
    text ? 'ui-icon-button--labeled' : 'ui-icon-button--icon-only',
    text && !hasIcon && 'ui-icon-button--text-only',
    compactSquare && !text && 'ui-icon-button--compact-square',
    className,
  );
  const children = (
    <>
      {hasIcon ? <span className="ui-icon-button-icon-slot" aria-hidden="true" /> : null}
      {text ? <span className="ui-icon-button-label">{text}</span> : null}
    </>
  );

  return (
    <OverlayControlShell
      hostClassName={classNames(
        'ui-icon-button-host',
        compactSquare && !text && 'ui-icon-button-host--compact-square',
        hostClassName,
      )}
      overlayClassName={classNames(
        'ui-icon-button-overlay',
        compactSquare && !text && 'ui-icon-button-overlay--compact-square',
        overlayClassName,
      )}
      disabled={props.disabled}
      overlay={icon ?? null}
      style={rootStyle}
    >
      {variant === 'action' ? (
        <ActionButton
          ref={ref}
          className={buttonClassName}
          quiet={quiet}
          emphasized={emphasized}
          selected={selected}
          toggles={toggles}
          label={tooltip}
          placement={placement}
          {...props}
        >
          {children}
        </ActionButton>
      ) : (
        <Button
          ref={ref}
          variant={variant}
          className={buttonClassName}
          aria-label={props['aria-label'] ?? tooltip}
          title={tooltip}
          {...props}
        >
          {children}
        </Button>
      )}
    </OverlayControlShell>
  );
});

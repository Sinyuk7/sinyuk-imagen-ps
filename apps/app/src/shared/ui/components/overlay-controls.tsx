import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { ActionButton } from '../primitives/native-controls';

interface OverlayControlShellProps {
  readonly hostClassName?: string;
  readonly overlayClassName?: string;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly overlay: ReactNode;
  readonly children: ReactNode;
  readonly style?: React.CSSProperties;
}

interface OverlayActionButtonProps extends Omit<ComponentPropsWithoutRef<typeof ActionButton>, 'children'> {
  readonly children?: ReactNode;
  readonly overlay: ReactNode;
  readonly hostClassName?: string;
  readonly overlayClassName?: string;
}

interface OverlayTriggerButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> {
  readonly children?: ReactNode;
  readonly open?: boolean;
  readonly overlay: ReactNode;
  readonly hostClassName?: string;
  readonly overlayClassName?: string;
}

function classNames(...parts: Array<string | undefined | false>): string | undefined {
  const value = parts.filter(Boolean).join(' ');
  return value || undefined;
}

/**
 * Photoshop UXP 中 button 内部的 SVG 可能塌成 0x0。
 *
 * 这里仅把图标提升到 button 的兄弟 overlay，文本与布局仍由 button
 * 本体负责，避免再次引入整组视觉叠加导致的重影问题。
 */
export function OverlayControlShell({
  hostClassName,
  overlayClassName,
  disabled,
  open,
  overlay,
  children,
  style,
}: OverlayControlShellProps) {
  return (
    <div
      className={classNames('ui-overlay-icon-host', hostClassName)}
      data-disabled={disabled ? 'true' : undefined}
      data-open={open ? 'true' : undefined}
      style={style}
    >
      {children}
      <span className={classNames('ui-overlay-icon-layer', overlayClassName)}>
        {overlay}
      </span>
    </div>
  );
}

export const OverlayActionButton = forwardRef<HTMLButtonElement, OverlayActionButtonProps>(function OverlayActionButton(
  {
    children,
    overlay,
    hostClassName,
    overlayClassName,
    className,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <OverlayControlShell
      hostClassName={hostClassName}
      overlayClassName={overlayClassName}
      disabled={disabled}
      overlay={overlay}
    >
      <ActionButton
        {...props}
        ref={ref}
        disabled={disabled}
        className={classNames('ui-overlay-icon-button', className)}
      >
        {children}
      </ActionButton>
    </OverlayControlShell>
  );
});

export const OverlayTriggerButton = forwardRef<HTMLButtonElement, OverlayTriggerButtonProps>(function OverlayTriggerButton(
  {
    children,
    overlay,
    hostClassName,
    overlayClassName,
    className,
    disabled,
    open,
    ...props
  },
  ref,
) {
  return (
    <OverlayControlShell
      hostClassName={hostClassName}
      overlayClassName={overlayClassName}
      disabled={disabled}
      open={open}
      overlay={overlay}
    >
      <button
        {...props}
        ref={ref}
        type="button"
        className={classNames('ui-overlay-icon-button', className)}
        disabled={disabled}
      >
        {children}
      </button>
    </OverlayControlShell>
  );
});

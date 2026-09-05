import {
  forwardRef,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { ActionButton } from '../primitives/native-controls';

interface OverlayControlShellProps {
  readonly hostRef?: RefObject<HTMLDivElement | null>;
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

interface OverlayTriggerButtonProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly overlay: ReactNode;
  readonly hostRef?: RefObject<HTMLDivElement | null>;
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
  hostRef,
  hostClassName,
  overlayClassName,
  disabled,
  open,
  overlay,
  children,
  style,
}: OverlayControlShellProps) {
  const internalHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = internalHostRef.current;
    if (!host) return undefined;

    const handleClick = (event: globalThis.MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.ui-overlay-icon-button')) return;
      const button = host.querySelector<HTMLElement>('.ui-overlay-icon-button');
      if (!button || button.getAttribute('aria-disabled') === 'true' || button.dataset.disabled === 'true') return;
      event.preventDefault();
      event.stopPropagation();
      button.click();
    };

    host.addEventListener('click', handleClick, true);
    return () => {
      host.removeEventListener('click', handleClick, true);
    };
  }, []);

  const setHostRef = (element: HTMLDivElement | null) => {
    internalHostRef.current = element;
    if (hostRef) {
      hostRef.current = element;
    }
  };

  return (
    <div
      ref={setHostRef}
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
    onClick,
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
        onClick={onClick}
        ref={ref}
        disabled={disabled}
        className={classNames('ui-overlay-icon-button', className)}
      >
        {children}
      </ActionButton>
    </OverlayControlShell>
  );
});

export const OverlayTriggerButton = forwardRef<HTMLElement, OverlayTriggerButtonProps>(function OverlayTriggerButton(
  {
    children,
    overlay,
    hostClassName,
    overlayClassName,
    className,
    disabled,
    open,
    hostRef,
    onClick,
    onKeyDown,
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
      hostRef={hostRef}
      overlay={overlay}
    >
      <span
        {...props}
        onClick={onClick}
        onKeyDown={onKeyDown}
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        className={classNames('ui-overlay-icon-button', className)}
        aria-disabled={disabled || undefined}
        data-disabled={disabled ? 'true' : undefined}
      >
        {children}
      </span>
    </OverlayControlShell>
  );
});

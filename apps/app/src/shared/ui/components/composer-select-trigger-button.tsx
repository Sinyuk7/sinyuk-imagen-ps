import type { KeyboardEvent, MouseEvent, RefObject } from 'react';
import type { IconName } from './icons';
import { Icon } from './icons';
import { OverlayTriggerButton } from './overlay-controls';

interface ComposerSelectTriggerButtonProps {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly open: boolean;
  readonly testId?: string;
  readonly triggerId?: string;
  readonly leadingIcon?: IconName;
  readonly chipRef: RefObject<HTMLButtonElement | null>;
  readonly chipBodyRef: RefObject<HTMLSpanElement | null>;
  readonly chipValueRef: RefObject<HTMLSpanElement | null>;
  readonly chipArrowRef: RefObject<HTMLSpanElement | null>;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export function ComposerSelectTriggerButton({
  label,
  value,
  disabled,
  open,
  testId,
  triggerId,
  leadingIcon,
  chipRef,
  chipBodyRef,
  chipValueRef,
  chipArrowRef,
  onClick,
  onKeyDown,
}: ComposerSelectTriggerButtonProps) {
  const className = ['cmp-chip', open ? 'open' : '', disabled ? 'dis' : ''].filter(Boolean).join(' ');
  const hostClassName = ['cmp-chip-host', open ? 'open' : '', disabled ? 'dis' : ''].filter(Boolean).join(' ');

  return (
    <OverlayTriggerButton
      ref={chipRef}
      id={triggerId}
      hostClassName={hostClassName}
      overlayClassName="cmp-chip-overlay"
      className={className}
      data-testid={testId}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      disabled={disabled}
      open={open}
      onClick={onClick}
      onKeyDown={onKeyDown}
      overlay={(
        <span className="cmp-chip-overlay-inner">
          {leadingIcon ? (
            <span className="cmp-chip-leading-proxy">
              <Icon name={leadingIcon} size={14} className="cmp-chip-leading" />
            </span>
          ) : null}
          <span className="cmp-chip-overlay-spacer" />
          <span className="cmp-chip-arrow-proxy">
            <Icon name="chevron-down" size={10} className="cmp-chip-arrow-icon" />
          </span>
        </span>
      )}
    >
      <span ref={chipBodyRef} className="cmp-chip-body">
        {leadingIcon ? <span className="cmp-chip-leading-slot" aria-hidden="true" /> : null}
        <span ref={chipValueRef} className="cmp-chip-value">{value}</span>
        <span ref={chipArrowRef} className="cmp-chip-arrow-text" aria-hidden="true">
          <span className="cmp-chip-arrow-slot" />
        </span>
      </span>
    </OverlayTriggerButton>
  );
}

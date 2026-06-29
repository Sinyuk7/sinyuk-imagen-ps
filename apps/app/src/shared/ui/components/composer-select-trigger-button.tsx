import type { KeyboardEvent, MouseEvent, RefObject } from 'react';
import type { IconName } from './icons';
import { Icon } from './icons';

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

  return (
    <button
      ref={chipRef}
      id={triggerId}
      type="button"
      className={className}
      data-testid={testId}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <span ref={chipBodyRef} className="cmp-chip-body">
        {leadingIcon ? <Icon name={leadingIcon} size={14} className="cmp-chip-leading" /> : null}
        <span ref={chipValueRef} className="cmp-chip-value">{value}</span>
        <span ref={chipArrowRef} className="cmp-chip-arrow-text" aria-hidden="true">
          <Icon name="chevron-down" size={10} className="cmp-chip-arrow-icon" />
        </span>
      </span>
    </button>
  );
}

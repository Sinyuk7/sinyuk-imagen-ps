import type { KeyboardEvent, MouseEvent, RefObject } from 'react';
import type { IconName } from './icons';
import { Icon } from './icons';

interface ComposerSelectTriggerProps {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly open: boolean;
  readonly testId?: string;
  readonly leadingIcon?: IconName;
  readonly trailingIcon: IconName;
  readonly chipRef: RefObject<HTMLButtonElement | null>;
  readonly chipBodyRef: RefObject<HTMLSpanElement | null>;
  readonly chipValueRef: RefObject<HTMLSpanElement | null>;
  readonly chipArrowRef: RefObject<HTMLSpanElement | null>;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export function ComposerSelectTrigger({
  label,
  value,
  disabled,
  open,
  testId,
  leadingIcon,
  trailingIcon,
  chipRef,
  chipBodyRef,
  chipValueRef,
  chipArrowRef,
  onClick,
  onKeyDown,
}: ComposerSelectTriggerProps) {
  const className = ['cmp-chip', open ? 'open' : '', disabled ? 'dis' : ''].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      ref={chipRef}
      data-testid={testId}
      className={className}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <span ref={chipBodyRef} className="cmp-chip-body">
        {leadingIcon ? <Icon name={leadingIcon} size={14} className="cmp-chip-leading" /> : <span className="cmp-dot" />}
        <span ref={chipValueRef} className="cmp-chip-value">{value}</span>
      </span>
      <span ref={chipArrowRef} className="cmp-chip-arrow" aria-hidden="true">
        <Icon name={trailingIcon} size={14} className="cmp-chip-chevron" />
      </span>
    </button>
  );
}

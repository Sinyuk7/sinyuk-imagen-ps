import type { KeyboardEvent, MouseEvent, RefObject } from 'react';
import type { IconName } from './icons';
import { Icon } from './icons';

interface ComposerSelectTriggerSpButtonProps {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly open: boolean;
  readonly testId?: string;
  readonly leadingIcon?: IconName;
  readonly chipRef: RefObject<HTMLElement | null>;
  readonly chipBodyRef: RefObject<HTMLSpanElement | null>;
  readonly chipValueRef: RefObject<HTMLSpanElement | null>;
  readonly chipArrowRef: RefObject<HTMLSpanElement | null>;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export function ComposerSelectTriggerSpButton({
  label,
  value,
  disabled,
  open,
  testId,
  leadingIcon,
  chipRef,
  chipBodyRef,
  chipValueRef,
  chipArrowRef,
  onClick,
  onKeyDown,
}: ComposerSelectTriggerSpButtonProps) {
  const className = ['cmp-chip', 'cmp-chip-sp-button', open ? 'open' : '', disabled ? 'dis' : ''].filter(Boolean).join(' ');

  return (
    <sp-button
      ref={chipRef}
      class={className}
      data-testid={testId}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      variant="secondary"
      disabled={disabled || undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <span ref={chipBodyRef} className="cmp-chip-body cmp-chip-body-sp-button">
        {leadingIcon ? <Icon name={leadingIcon} size={14} className="cmp-chip-leading-sp-button" /> : null}
        <span ref={chipValueRef} className="cmp-chip-value cmp-chip-value-sp-button">{value}</span>
        <span ref={chipArrowRef} className="cmp-chip-arrow-text" aria-hidden="true">
          <Icon name="chevron-down" size={10} className="cmp-chip-arrow-icon" />
        </span>
      </span>
    </sp-button>
  );
}

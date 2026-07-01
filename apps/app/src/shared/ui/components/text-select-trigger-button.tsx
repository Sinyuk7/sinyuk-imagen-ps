import { Icon } from './icons';
import { OverlayTriggerButton } from './overlay-controls';
import type { SelectTriggerButtonCommonProps } from './select-trigger-button.types';

export function TextSelectTriggerButton({
  label,
  value,
  disabled,
  open,
  testId,
  triggerId,
  chipRef,
  chipBodyRef,
  chipValueRef,
  chipArrowRef,
  onClick,
  onKeyDown,
}: SelectTriggerButtonCommonProps) {
  const className = ['cmp-chip', 'cmp-chip-text', open ? 'open' : '', disabled ? 'dis' : ''].filter(Boolean).join(' ');
  const hostClassName = ['cmp-chip-host', 'cmp-chip-host-text', open ? 'open' : '', disabled ? 'dis' : ''].filter(Boolean).join(' ');

  return (
    <OverlayTriggerButton
      ref={chipRef}
      id={triggerId}
      hostClassName={hostClassName}
      overlayClassName="cmp-chip-overlay cmp-chip-overlay-text"
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
        <span className="cmp-chip-overlay-inner cmp-chip-overlay-inner-text">
          <span className="cmp-chip-overlay-spacer cmp-chip-overlay-spacer-text" />
          <span className="cmp-chip-arrow-proxy cmp-chip-arrow-proxy-text">
            <Icon name="chevron-down" size={10} className="cmp-chip-arrow-icon cmp-chip-arrow-icon-text" />
          </span>
        </span>
      )}
    >
      <span ref={chipBodyRef} className="cmp-chip-body cmp-chip-body-text">
        <span ref={chipValueRef} className="cmp-chip-value cmp-chip-value-text">{value}</span>
        <span ref={chipArrowRef} className="cmp-chip-arrow-text cmp-chip-arrow-text-text" aria-hidden="true">
          <span className="cmp-chip-arrow-slot cmp-chip-arrow-slot-text" />
        </span>
      </span>
    </OverlayTriggerButton>
  );
}

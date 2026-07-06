import { Icon } from './icons';
import { OverlayTriggerButton } from './overlay-controls';
import type { SelectTriggerButtonCommonProps } from './select-trigger-button.types';

export function TextSelectTriggerButton({
  label,
  value,
  selectedId,
  disabled,
  open,
  testId,
  triggerId,
  ariaDescribedBy,
  menuId,
  hostRef,
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
      hostRef={hostRef}
      hostClassName={hostClassName}
      overlayClassName="cmp-chip-overlay cmp-chip-overlay-text"
      className={className}
      data-testid={testId}
      data-selected-id={selectedId}
      aria-label={`${label}: ${value}`}
      aria-describedby={ariaDescribedBy}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      disabled={disabled}
      open={open}
      onClick={onClick}
      onKeyDown={onKeyDown}
      overlay={(
        <span ref={chipBodyRef} className="cmp-chip-overlay-inner cmp-chip-overlay-inner-text">
          <span ref={chipValueRef} className="cmp-chip-overlay-value cmp-chip-overlay-value-text">{value}</span>
          <span ref={chipArrowRef} className="cmp-chip-arrow-proxy cmp-chip-arrow-proxy-text">
            <Icon name="chevron-down" size={10} className="cmp-chip-arrow-icon cmp-chip-arrow-icon-text" />
          </span>
        </span>
      )}
    >
      <span className="cmp-chip-a11y-value cmp-chip-a11y-value-text" aria-hidden="true" />
    </OverlayTriggerButton>
  );
}

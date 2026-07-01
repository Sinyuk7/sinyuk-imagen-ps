import { Icon, type IconName } from './icons';
import { OverlayTriggerButton } from './overlay-controls';
import type { SelectTriggerButtonCommonProps } from './select-trigger-button.types';

interface IconSelectTriggerButtonProps extends SelectTriggerButtonCommonProps {
  readonly icon: IconName;
}

export function IconSelectTriggerButton({
  label,
  value,
  disabled,
  open,
  testId,
  triggerId,
  icon,
  chipRef,
  chipBodyRef,
  chipValueRef,
  chipArrowRef,
  onClick,
  onKeyDown,
}: IconSelectTriggerButtonProps) {
  const className = ['cmp-chip', 'cmp-chip-icon', open ? 'open' : '', disabled ? 'dis' : ''].filter(Boolean).join(' ');
  const hostClassName = ['cmp-chip-host', 'cmp-chip-host-icon', open ? 'open' : '', disabled ? 'dis' : ''].filter(Boolean).join(' ');

  return (
    <OverlayTriggerButton
      ref={chipRef}
      id={triggerId}
      hostClassName={hostClassName}
      overlayClassName="cmp-chip-overlay cmp-chip-overlay-icon"
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
        <span className="cmp-chip-overlay-inner cmp-chip-overlay-inner-icon">
          <span className="cmp-chip-leading-proxy cmp-chip-leading-proxy-icon">
            <Icon name={icon} size={16} className="cmp-chip-leading cmp-chip-leading-icon" />
          </span>
          <span className="cmp-chip-overlay-spacer cmp-chip-overlay-spacer-icon" />
          <span className="cmp-chip-arrow-proxy cmp-chip-arrow-proxy-icon">
            <Icon name="chevron-down" size={12} className="cmp-chip-arrow-icon cmp-chip-arrow-icon-icon" />
          </span>
        </span>
      )}
    >
      <span ref={chipBodyRef} className="cmp-chip-body cmp-chip-body-icon">
        <span className="cmp-chip-leading-slot cmp-chip-leading-slot-icon" aria-hidden="true" />
        <span ref={chipValueRef} className="cmp-chip-value cmp-chip-value-icon">{value}</span>
        <span ref={chipArrowRef} className="cmp-chip-arrow-text cmp-chip-arrow-text-icon" aria-hidden="true">
          <span className="cmp-chip-arrow-slot cmp-chip-arrow-slot-icon" />
        </span>
      </span>
    </OverlayTriggerButton>
  );
}

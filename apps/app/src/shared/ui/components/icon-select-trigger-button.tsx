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
        <span ref={chipBodyRef} className="cmp-chip-overlay-inner cmp-chip-overlay-inner-icon">
          <span className="cmp-chip-leading-proxy cmp-chip-leading-proxy-icon">
            <Icon name={icon} size={16} className="cmp-chip-leading cmp-chip-leading-icon" />
          </span>
          <span ref={chipValueRef} className="cmp-chip-overlay-value cmp-chip-overlay-value-icon">{value}</span>
          <span className="cmp-chip-arrow-proxy cmp-chip-arrow-proxy-icon">
            <Icon name="chevron-down" size={12} className="cmp-chip-arrow-icon cmp-chip-arrow-icon-icon" />
          </span>
        </span>
      )}
    >
      <span ref={chipArrowRef} className="cmp-chip-a11y-value cmp-chip-a11y-value-icon" aria-hidden="true" />
    </OverlayTriggerButton>
  );
}

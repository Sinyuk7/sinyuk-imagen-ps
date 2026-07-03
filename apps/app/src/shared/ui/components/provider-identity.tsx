import type { SyntheticEvent } from 'react';
import { ModelAvatarIcon } from './model-avatar-icon';
import type { ModelAvatarIconName } from './generated/model-avatar-icons';
import { OverlayControlShell } from './overlay-controls';

interface ProviderIdentityProps {
  readonly iconName: ModelAvatarIconName;
  readonly providerName: string;
  readonly modelLabel?: string;
  readonly disabled?: boolean;
  readonly onClick?: (event: SyntheticEvent<HTMLDivElement>) => void;
}

export function ProviderIdentity({
  iconName,
  providerName,
  modelLabel,
  disabled = false,
  onClick,
}: ProviderIdentityProps) {
  const interactive = !disabled && typeof onClick === 'function';

  return (
    <div
      className="prov-identity"
      data-disabled={disabled ? 'true' : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={providerName}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive
        ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onClick?.(event);
            }
          }
        : undefined}
    >
      <OverlayControlShell
        hostClassName="prov-identity-host"
        overlayClassName="prov-identity-overlay"
        disabled={disabled}
        overlay={(
          <span className="prov-identity-icon-shell">
            <ModelAvatarIcon name={iconName} size={16} className="prov-identity-icon-svg" />
          </span>
        )}
      >
        <span className="prov-identity-icon-slot" aria-hidden="true" />
      </OverlayControlShell>
      <div className="prov-identity-button">
        <span className="prov-name-wrap">
          <span className="prov-name-lbl">{providerName}</span>
          {modelLabel ? <span className="prov-model-lbl">/ {modelLabel}</span> : null}
        </span>
      </div>
    </div>
  );
}

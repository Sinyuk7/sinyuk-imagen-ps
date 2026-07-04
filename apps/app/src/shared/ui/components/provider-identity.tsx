import type { SyntheticEvent } from 'react';
import { OverlayControlShell } from './overlay-controls';

interface ProviderIdentityProps {
  readonly providerName: string;
  readonly modelLabel?: string;
  readonly disabled?: boolean;
  readonly onClick?: (event: SyntheticEvent<HTMLDivElement>) => void;
}

function providerInitial(providerName: string): string {
  const normalized = providerName.trim();
  return normalized ? normalized[0]!.toUpperCase() : '?';
}

export function ProviderIdentity({
  providerName,
  modelLabel,
  disabled = false,
  onClick,
}: ProviderIdentityProps) {
  const interactive = !disabled && typeof onClick === 'function';
  const initial = providerInitial(providerName);

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
          <span className="prov-identity-icon-shell" aria-hidden="true">
            <span className="prov-identity-icon-text">{initial}</span>
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

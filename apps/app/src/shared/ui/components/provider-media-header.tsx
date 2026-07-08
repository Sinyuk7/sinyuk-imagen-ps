import type { SyntheticEvent } from 'react';
import { OverlayControlShell } from './overlay-controls';

interface ProviderMediaHeaderProps {
  readonly providerName: string;
  readonly modelLabel?: string;
  readonly statusLabel: string;
  readonly durationLabel?: string;
  readonly statusTone: 'ok' | 'run' | 'err' | 'info';
  readonly disabled?: boolean;
  readonly onClick?: (event: SyntheticEvent<HTMLDivElement>) => void;
  readonly testIdPrefix?: string;
}

function providerInitial(providerName: string): string {
  const normalized = providerName.trim();
  return normalized ? normalized[0]!.toUpperCase() : '?';
}

export function ProviderMediaHeader({
  providerName,
  modelLabel,
  statusLabel,
  durationLabel,
  statusTone,
  disabled = false,
  onClick,
  testIdPrefix,
}: ProviderMediaHeaderProps) {
  const interactive = !disabled && typeof onClick === 'function';
  const initial = providerInitial(providerName);

  return (
    <div
      className="prov-media-header"
      data-disabled={disabled ? 'true' : undefined}
      data-testid={testIdPrefix ? `${testIdPrefix}-header` : undefined}
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
      <div className="prov-media-header-main">
        <div
          className="prov-media-provider-row"
          data-testid={testIdPrefix ? `${testIdPrefix}-provider-row` : undefined}
        >
          <span className="prov-media-provider-name">{providerName}</span>
        </div>
        <div
          className="prov-media-meta-row"
          data-testid={testIdPrefix ? `${testIdPrefix}-meta-row` : undefined}
        >
          {modelLabel ? (
            <span
              className="prov-media-model-name"
              data-testid={testIdPrefix ? `${testIdPrefix}-model-name` : undefined}
            >
              {modelLabel}
            </span>
          ) : null}
          <span
            className="prov-media-status-group"
            data-testid={testIdPrefix ? `${testIdPrefix}-status-group` : undefined}
          >
            <span className={`sdot ${statusTone}`} />
            <span className={`prov-status-text ${statusTone}`}>{statusLabel}</span>
            {durationLabel ? (
              <>
                <span className="prov-media-meta-separator" aria-hidden="true">·</span>
                <span className="prov-media-duration">{durationLabel}</span>
              </>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}

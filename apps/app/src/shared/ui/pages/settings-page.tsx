import { type KeyboardEvent } from 'react';
import type { ApiFormat, ProviderProfile } from '@imagen-ps/application';
import type { AppGenerationSettings } from '../../ports/app-generation-settings';
import { profileToProviderRow } from '../../domain/mappers';
import { Icon } from '../components/icons';
import { MotionContent } from '../components/motion-ui';
import { IconButton } from '../primitives/icon-button';
import { useI18n } from '../i18n/i18n-context';

interface SettingsPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onReload: () => Promise<void>;
  readonly onOpenProfile: (profileId: string) => void;
  readonly promptOptimizerProfile?: ProviderProfile | null;
  readonly onOpenPromptOptimizer?: () => void;
  readonly generationSettings?: AppGenerationSettings;
  readonly onOpenGlobalGeneration?: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';
}

interface ProviderListRow {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly apiFormatLabel: string;
  readonly defaultModel?: string;
}

interface ProviderListItemProps {
  readonly row: ProviderListRow;
  readonly special?: boolean;
  readonly onOpen: () => void;
  readonly labels: {
    readonly ready: string;
    readonly needsSetup: string;
    readonly configured: string;
  };
}

function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>, onOpen: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  onOpen();
}

function ProviderListItem({
  row,
  special = false,
  onOpen,
  labels,
}: ProviderListItemProps) {
  const hasDefaultModel = Boolean(row.defaultModel);
  const readinessTone = !hasDefaultModel ? 'warning' : row.enabled ? 'ready' : 'configured';
  const readinessLabel = !hasDefaultModel ? labels.needsSetup : row.enabled ? labels.ready : labels.configured;

  return (
    <MotionContent watch={`${row.profileId}:${row.enabled}:${row.defaultModel ?? ''}`}>
      <div
        data-testid={`provider-row-${row.profileId}`}
        className={`prov-row settings-provider-row ${special ? 'is-special' : ''} ${row.enabled ? 'is-enabled' : 'is-disabled'}`}
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => onRowKeyDown(event, onOpen)}
      >
        <div className="prov-leading">
          <div
            className="prov-ico"
            style={special
              ? { background: 'var(--app-color-informative-subtle)', color: 'var(--app-color-informative)' }
              : { background: 'var(--app-color-accent-subtle)', color: 'var(--app-color-accent-default)' }}
          >
            {special ? <Icon name="magic-wand" size={14} /> : initials(row.displayName)}
          </div>
        </div>
        <div className="prov-content">
          <div className="prov-title-row">
            <span className="prov-name">{row.displayName}</span>
          </div>
          <div className="prov-meta-row">
            <span className="prov-family">{row.apiFormatLabel}</span>
            <span className="prov-meta-sep" aria-hidden="true">•</span>
            <span className="prov-model">{row.defaultModel ?? row.apiFormat}</span>
          </div>
        </div>
        <div className="prov-end">
          <div className={`prov-readiness ${readinessTone}`} aria-label={readinessLabel}>
            <span className="prov-readiness-dot" aria-hidden="true" />
            <span className="prov-status-text">{readinessLabel}</span>
          </div>
          <div className="prov-trail"><Icon name="chevron-right" /></div>
        </div>
      </div>
    </MotionContent>
  );
}

export function SettingsPage({
  onNav,
  profiles,
  loading,
  error,
  onReload,
  onOpenProfile,
  promptOptimizerProfile,
  onOpenPromptOptimizer,
  generationSettings,
  onOpenGlobalGeneration,
}: SettingsPageProps) {
  const { messages: t } = useI18n();
  const rows = profiles.map(profileToProviderRow);
  const optimizerRow = promptOptimizerProfile ? profileToProviderRow(promptOptimizerProfile) : null;
  const labels = {
    ready: t.common.ready,
    needsSetup: t.common.needsSetup,
    configured: t.settings.configured,
  };

  return (
    <div className="page page-enter">
      <header className="hdr">
        <IconButton
          data-testid="providers-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => onNav('main')}
        />
        <div className="hdr-title">Providers</div>
        <IconButton
          data-testid="providers-refresh-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="refresh" />}
          tooltip={t.common.refresh}
          onClick={() => void onReload()}
        />
        <IconButton
          data-testid="providers-add-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="add" />}
          tooltip={t.common.addProvider}
          placement="bottom"
          onClick={() => onNav('settings-add')}
        />
      </header>
      <div className="scroll">
        <div className="sec-lbl">{t.settings.configured}</div>
        <div
          data-testid="global-generation-settings-row"
          className="prov-row settings-provider-row is-special"
          role="button"
          tabIndex={0}
          onClick={() => onOpenGlobalGeneration?.()}
          onKeyDown={(event) => onRowKeyDown(event, () => onOpenGlobalGeneration?.())}
        >
          <div className="prov-leading">
            <div className="prov-ico" style={{ background: 'var(--app-color-accent-subtle)', color: 'var(--app-color-accent-default)' }}>
              <Icon name="settings" size={14} />
            </div>
          </div>
          <div className="prov-content">
            <div className="prov-title-row">
              <span className="prov-name">{t.settings.globalGeneration}</span>
            </div>
            <div className="prov-meta-row">
              <span className="prov-family">
                {generationSettings
                  ? `${generationSettings.outputSizePreset.toUpperCase()} · ${generationSettings.outputFormat.toUpperCase()} · ${generationSettings.aspectRatio}`
                  : t.settings.loading}
              </span>
            </div>
          </div>
          <div className="prov-end">
            <div className="prov-trail"><Icon name="chevron-right" /></div>
          </div>
        </div>
        {loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
        {error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{error}</div>}
        {!loading && rows.length === 0 && !optimizerRow && (
          <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.noProviderProfile}</div>
        )}
        {optimizerRow && (
          <ProviderListItem
            row={optimizerRow}
            special
            labels={labels}
            onOpen={() => onOpenPromptOptimizer?.()}
          />
        )}
        {rows.map((row) => (
          <ProviderListItem
            key={row.profileId}
            row={row}
            labels={labels}
            onOpen={() => onOpenProfile(row.profileId)}
          />
        ))}
        <div className="footer-info">
          <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 10, color: 'var(--app-color-text-muted)' }}>imagen-ps app</span>
        </div>
      </div>
    </div>
  );
}

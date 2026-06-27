import type { ProviderProfile } from '@imagen-ps/application';
import { profileToProviderRow } from '../../domain/mappers';
import { Icon } from '../components/icons';
import { ActionButton, Tag } from '../primitives/spectrum-controls';
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
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';
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
}: SettingsPageProps) {
  const { messages: t } = useI18n();
  const rows = profiles.map(profileToProviderRow);
  const optimizerRow = promptOptimizerProfile ? profileToProviderRow(promptOptimizerProfile) : null;

  return (
    <div className="page page-enter">
      <header className="hdr">
        <ActionButton
          data-testid="providers-back-button"
          className="hdr-btn"
          quiet
          onClick={() => onNav('main')}
        >
          <Icon name="chevron-left" />
        </ActionButton>
        <div className="hdr-title">Providers</div>
        <ActionButton
          data-testid="providers-refresh-button"
          className="hdr-btn"
          quiet
          label={t.common.refresh}
          onClick={() => void onReload()}
        >
          <Icon name="refresh" />
        </ActionButton>
        <ActionButton
          data-testid="providers-add-button"
          className="hdr-btn"
          quiet
          label={t.common.addProvider}
          placement="bottom"
          onClick={() => onNav('settings-add')}
        >
          <Icon name="add" />
        </ActionButton>
      </header>
      <div className="scroll">
        <div className="sec-lbl">{t.settings.configured}</div>
        {loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
        {error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{error}</div>}
        {!loading && rows.length === 0 && !optimizerRow && (
          <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.noProviderProfile}</div>
        )}
        {optimizerRow && (
          <div
            key={optimizerRow.profileId}
            data-testid={`provider-row-${optimizerRow.profileId}`}
            className="prov-row"
            onClick={() => onOpenPromptOptimizer?.()}
          >
            <div className="prov-ico" style={{ background: 'var(--app-color-informative-subtle)', color: 'var(--app-color-informative)' }}>
              <Icon name="magic-wand" size={14} />
            </div>
            <div className="prov-info">
              <div className="prov-name">
                <span>{optimizerRow.displayName}</span>
                <span className={`badge prov-primary-status ${optimizerRow.enabled ? 'connected' : 'error'}`}>
                  {optimizerRow.enabled ? t.common.enabled : t.common.disabled}
                </span>
              </div>
              <div className="prov-meta">
                <Tag className="prov-family">{optimizerRow.family}</Tag>
                <span className="prov-model">{optimizerRow.defaultModel ?? optimizerRow.providerId}</span>
              </div>
            </div>
            <div className="prov-trail"><Icon name="chevron-right" /></div>
          </div>
        )}
        {rows.map((row) => {
          const ready = row.enabled && Boolean(row.defaultModel);
          const completenessLabel = ready ? t.common.ready : t.common.disabled;
          return (
          <div key={row.profileId} data-testid={`provider-row-${row.profileId}`} className="prov-row" onClick={() => onOpenProfile(row.profileId)}>
            <div className="prov-ico" style={{ background: 'var(--app-color-accent-subtle)', color: 'var(--app-color-accent-default)' }}>
              {initials(row.displayName)}
            </div>
            <div className="prov-info">
              <div className="prov-name">
                <span>{row.displayName}</span>
                <span className={`badge prov-primary-status ${row.enabled ? 'connected' : 'error'}`}>{row.enabled ? t.common.enabled : t.common.disabled}</span>
              </div>
              <div className="prov-meta">
                <Tag className="prov-family">{row.family}</Tag>
                <span className="prov-model">{row.defaultModel ?? row.providerId}</span>
                <div className="completeness" aria-hidden="true">
                  <div className={`cdot ${row.enabled ? 'f' : 'e'}`} />
                  <div className="cdot f" />
                  <div className={row.defaultModel ? 'cdot f' : 'cdot w'} />
                </div>
                <span className="prov-status-text" aria-label={completenessLabel}>{ready ? t.common.ready : t.common.needsSetup}</span>
              </div>
            </div>
            <div className="prov-trail"><Icon name="chevron-right" /></div>
          </div>
          );
        })}
        <div className="footer-info">
          <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 10, color: 'var(--app-color-text-muted)' }}>imagen-ps app</span>
        </div>
      </div>
    </div>
  );
}

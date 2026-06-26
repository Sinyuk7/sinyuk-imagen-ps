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
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';
}

export function SettingsPage({ onNav, profiles, loading, error, onReload, onOpenProfile }: SettingsPageProps) {
  const { messages: t } = useI18n();
  const rows = profiles.map(profileToProviderRow);

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
        {loading && <div style={{ padding: 16, color: 'var(--txd)', fontSize: 12 }}>{t.settings.loading}</div>}
        {error && <div style={{ padding: 16, color: 'var(--er)', fontSize: 12 }}>{error}</div>}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 16, color: 'var(--txd)', fontSize: 12 }}>{t.settings.noProviderProfile}</div>
        )}
        {rows.map((row) => (
          <div key={row.profileId} data-testid={`provider-row-${row.profileId}`} className="prov-row" onClick={() => onOpenProfile(row.profileId)}>
            <div className="prov-ico" style={{ background: 'rgba(120,231,192,.12)', color: 'var(--pr)' }}>
              {initials(row.displayName)}
            </div>
            <div className="prov-info">
              <div className="prov-name">
                <span>{row.displayName}</span>
                <Tag className="prov-family">{row.family}</Tag>
                <span className={`badge ${row.enabled ? 'connected' : 'error'}`}>{row.enabled ? t.common.enabled : t.common.disabled}</span>
              </div>
              <div className="prov-model">{row.defaultModel ?? row.providerId}</div>
            </div>
            <div className="completeness">
              <div className={`cdot ${row.enabled ? 'f' : 'e'}`} />
              <div className="cdot f" />
              <div className={row.defaultModel ? 'cdot f' : 'cdot w'} />
            </div>
            <Icon name="chevron-right" />
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="footer-info">
          <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>imagen-ps app</span>
        </div>
      </div>
    </div>
  );
}

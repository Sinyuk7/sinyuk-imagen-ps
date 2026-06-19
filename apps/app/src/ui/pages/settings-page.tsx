import type { ProviderProfile } from '@imagen-ps/application';
import { profileToProviderRow } from '../../app-services/mappers';
import { SI } from '../components/icons';
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
        <button className="hdr-btn" onClick={() => onNav('main')}>
          <SI d="m15 18-6-6 6-6" />
        </button>
        <div className="hdr-title">Providers</div>
        <button className="hdr-btn tt-wrap" title={t.common.refresh} onClick={() => void onReload()}>
          <SI d={['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5']} w={2.2} />
          <div className="tt">{t.common.refresh}</div>
        </button>
        <button className="hdr-btn tt-wrap" title={t.common.addProvider} onClick={() => onNav('settings-add')}>
          <SI d="M12 5v14M5 12h14" w={2.5} />
          <div className="tt">{t.common.addProvider}</div>
        </button>
      </header>
      <div className="scroll">
        <div className="sec-lbl">{t.settings.configured}</div>
        {loading && <div style={{ padding: 16, color: 'var(--txd)', fontSize: 12 }}>{t.settings.loading}</div>}
        {error && <div style={{ padding: 16, color: 'var(--er)', fontSize: 12 }}>{error}</div>}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 16, color: 'var(--txd)', fontSize: 12 }}>{t.settings.noProviderProfile}</div>
        )}
        {rows.map((row) => (
          <div key={row.profileId} className="prov-row" onClick={() => onOpenProfile(row.profileId)}>
            <div className="prov-ico" style={{ background: 'rgba(120,231,192,.12)', color: 'var(--pr)' }}>
              {initials(row.displayName)}
            </div>
            <div className="prov-info">
              <div className="prov-name">
                <span>{row.displayName}</span>
                <span style={{ fontFamily: 'var(--fM)', fontSize: 9, color: 'var(--txd)', background: 'var(--s2)', border: '1px solid var(--bd)', padding: '1px 5px', borderRadius: 3 }}>
                  {row.family}
                </span>
                <span className={`badge ${row.enabled ? 'connected' : 'error'}`}>{row.enabled ? t.common.enabled : t.common.disabled}</span>
              </div>
              <div className="prov-model">{row.defaultModel ?? row.providerId}</div>
            </div>
            <div className="completeness">
              <div className={`cdot ${row.enabled ? 'f' : 'e'}`} />
              <div className="cdot f" />
              <div className={row.defaultModel ? 'cdot f' : 'cdot w'} />
            </div>
            <SI d="m9 18 6-6-6-6" style={{ color: 'var(--txd)', flexShrink: 0 }} />
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

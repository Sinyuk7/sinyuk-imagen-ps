import { useEffect, useState } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../app-services/app-services-context';
import { providerConfigFromForm, useProfileDetail, useProfileModels } from '../hooks/use-provider-settings';
import { SI } from '../components/icons';
import { useI18n } from '../i18n/i18n-context';

interface SettingsDetailPageProps {
  readonly onNav: (view: string) => void;
  readonly profileId: string | null;
  readonly onProfilesChanged: (profileId: string | null) => Promise<void>;
}

function readConfigString(profile: ProviderProfile, key: string): string {
  const value = profile.config[key];
  return typeof value === 'string' ? value : '';
}

export function SettingsDetailPage({ onNav, profileId, onProfilesChanged }: SettingsDetailPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const detail = useProfileDetail(services, profileId);
  const models = useProfileModels(services, profileId);
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    setDisplayName(detail.profile.displayName);
    setBaseUrl(readConfigString(detail.profile, 'baseURL'));
    setDefaultModel(readConfigString(detail.profile, 'defaultModel'));
    setEnabled(detail.profile.enabled);
    setApiKey('');
  }, [detail.profile]);

  const save = async () => {
    if (!detail.profile) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const family = String(detail.profile.config.family ?? detail.profile.providerId);
      const profile = await detail.save({
        profileId: detail.profile.profileId,
        providerId: detail.profile.providerId,
        displayName: displayName.trim() || detail.profile.displayName,
        enabled,
        config: {
          ...detail.profile.config,
          ...providerConfigFromForm(
            detail.profile.providerId,
            displayName.trim() || detail.profile.displayName,
            family,
            baseUrl.trim(),
            defaultModel,
          ),
        },
        ...(apiKey.trim() ? { secretValues: { apiKey: apiKey.trim() } } : {}),
      });
      setStatus(t.settings.saved);
      await onProfilesChanged(profile.profileId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await save();
      const result = await detail.test(true);
      const reachable = result.connectivity?.reachable;
      setStatus(reachable === false ? t.settings.configValidNoModels : t.settings.testSuccess);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await detail.remove();
      await onProfilesChanged(null);
      onNav('settings');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!profileId) {
    return (
      <div className="page page-enter">
        <header className="hdr">
          <button className="hdr-btn" onClick={() => onNav('settings')}>
            <SI d="m15 18-6-6 6-6" />
          </button>
          <div className="hdr-title">Provider</div>
          <div style={{ width: 32 }} />
        </header>
        <div className="scroll">
          <div style={{ padding: 16, color: 'var(--txd)', fontSize: 12 }}>{t.settings.noProfileSelected}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => onNav('settings')}>
          <SI d="m15 18-6-6 6-6" />
        </button>
        <div className="hdr-center">
          <span style={{ fontFamily: 'var(--fD)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>
            {detail.profile?.displayName ?? 'Provider'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fM)', fontSize: 10, color: enabled ? 'var(--ok)' : 'var(--txd)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: enabled ? 'var(--ok)' : 'var(--txd)', display: 'inline-block' }} />
            {enabled ? t.common.enabled : t.common.disabled}
          </div>
        </div>
        <button className="hdr-btn" onClick={() => void detail.reload()}>
          <SI d={['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5']} />
        </button>
      </header>

      <div className="scroll">
        {detail.loading && <div style={{ padding: 16, color: 'var(--txd)', fontSize: 12 }}>{t.settings.loading}</div>}
        {detail.error && <div style={{ padding: 16, color: 'var(--er)', fontSize: 12 }}>{detail.error}</div>}
        {detail.profile && (
          <>
            <div className="section">
              <div className="section-title">{t.settings.connectionInfo}</div>
              <div className="field">
                <label className="field-label">{t.settings.alias}</label>
                <input className="field-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Base URL</label>
                <input className="field-input mono" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">API Key</label>
                <div className="pw-wrap">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="field-input mono"
                    placeholder={detail.profile.secretRefs?.apiKey ? t.settings.savedSecretPlaceholder : 'sk-...'}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                  <button className="pw-toggle" onClick={() => setShowKey((shown) => !shown)}>
                    <SI d={showKey
                      ? 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24'
                      : 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'
                    } />
                  </button>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--txm)', fontSize: 12 }}>
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                {t.settings.enableProfile}
              </label>
            </div>

            <div className="section">
              <div className="section-title">{t.settings.defaultModel}</div>
              <div className="chips">
                {models.models.map((model) => (
                  <button
                    key={model.id}
                    className={`chip${model.id === defaultModel ? ' act' : ''}`}
                    onClick={() => setDefaultModel(model.id)}
                  >
                    {model.displayName ?? model.id}
                  </button>
                ))}
                <input
                  className="field-input mono"
                  style={{ marginTop: 8 }}
                  placeholder={t.settings.customModelId}
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.target.value)}
                />
              </div>
              {models.error && <div className="field-hint" style={{ color: 'var(--wa)' }}>{models.error}</div>}
              <button className="test-btn" style={{ marginTop: 10 }} disabled={models.loading || busy} onClick={() => void models.refresh()}>
                {models.loading ? t.settings.refreshingModels : t.settings.refreshModels}
              </button>
            </div>

            <div className="test-area">
              <button className="test-btn" disabled={busy} onClick={() => void test()}>
                {busy
                  ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin"><path d="M21 12a9 9 0 1 1-9-9" /></svg> {t.settings.testingConnection}</>
                  : <><SI d="M5 12h14M12 5l7 7-7 7" /> {t.settings.testConnection}</>
                }
              </button>
              {status && <div className={status.includes(':') ? 'test-result err' : 'test-result ok'}>{status}</div>}
            </div>
          </>
        )}
      </div>

      <footer className="det-footer">
        <button className="btn-save" disabled={busy || !detail.profile} onClick={() => void save()}>{t.common.save}</button>
        <button className="btn-del" disabled={busy || !detail.profile} onClick={() => void remove()}>
          <SI d={['M3 6h18', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2']} />
        </button>
      </footer>
    </div>
  );
}

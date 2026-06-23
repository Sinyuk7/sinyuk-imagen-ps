import { useMemo, useState } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../app-services/app-services-context';
import { providerConfigFromForm, useProviderCatalog } from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { StatusNotice } from '../components/status-notice';
import { UxpTextField } from '../components/uxp-form-controls';
import { useI18n } from '../i18n/i18n-context';
import { statusFromProviderTestResult, type ProviderStatus } from '../provider-status';

interface SettingsAddPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly onProfileSaved: (profileId: string) => Promise<void>;
}

function createProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `profile-${crypto.randomUUID()}`;
  }
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultBaseUrl(providerId: string): string {
  return providerId === 'mock' ? 'https://mock.local' : '';
}

function nextAlias(baseName: string, profiles: readonly ProviderProfile[]): string {
  const used = new Set(profiles.map((profile) => profile.displayName.trim()));
  if (!used.has(baseName)) {
    return baseName;
  }
  for (let index = 1; ; index += 1) {
    const candidate = `${baseName}(${index})`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

export function SettingsAddPage({ onNav, profiles, onProfileSaved }: SettingsAddPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const providers = useProviderCatalog(services);
  const [profileId] = useState(createProfileId);
  const [step, setStep] = useState(1);
  const [providerId, setProviderId] = useState<string | null>(providers[0]?.id ?? null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl(providers[0]?.id ?? ''));
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => providers.find((provider) => provider.id === providerId), [providerId, providers]);

  const saveProfile = async (): Promise<string> => {
    if (!selected) {
      throw new Error(t.settings.selectProviderType);
    }
    const displayName = name.trim() || nextAlias(selected.displayName, profiles);
    const result = await services.commands.saveProviderProfile({
      profileId,
      providerId: selected.id,
      displayName,
      enabled: true,
      config: providerConfigFromForm(selected.id, displayName, selected.family, baseUrl.trim(), defaultModel),
      ...(apiKey.trim() ? { secretValues: { apiKey: apiKey.trim() } } : {}),
    });
    if (!result.ok) {
      throw new Error(`${result.error.category}: ${result.error.message}`);
    }
    return result.value.profileId;
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const profileId = await saveProfile();
      await onProfileSaved(profileId);
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const profileId = await saveProfile();
      const result = await services.commands.testProviderProfile(profileId, { connect: true });
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      setStatus(statusFromProviderTestResult(result.value, t));
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => (step === 1 ? onNav('settings') : setStep(1))}>
          <Icon name="chevron-left" />
        </button>
        <div className="hdr-center">
          <span style={{ fontFamily: 'var(--fD)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>
            {step === 1 ? t.common.addProvider : selected?.displayName}
          </span>
          {step === 2 && <span style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)' }}>2 / 2</span>}
        </div>
        <div style={{ width: 32 }} />
      </header>

      <div className="scroll">
        {step === 1 ? (
          <div>
            <div className="sec-lbl" style={{ paddingTop: 16 }}>{t.settings.chooseType}</div>
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="prov-row"
                onClick={() => {
                  setProviderId(provider.id);
                  setName(nextAlias(provider.displayName, profiles));
                  setBaseUrl(defaultBaseUrl(provider.id));
                  setStep(2);
                }}
              >
                <div className="prov-ico" style={{ background: 'var(--s2)', color: 'var(--txm)', fontFamily: 'var(--fM)', fontSize: 10 }}>
                  {provider.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="prov-info">
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>{provider.displayName}</div>
                  <div style={{ fontFamily: 'var(--fM)', fontSize: 10, color: 'var(--txd)', marginTop: 2 }}>{provider.family}</div>
                </div>
                <Icon name="chevron-right" style={{ color: 'var(--txd)' }} />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="section">
              <div className="section-title">{t.settings.config}</div>
              <div className="field">
                <label className="field-label">{t.settings.alias}</label>
                <UxpTextField className="field-input" placeholder={selected?.displayName} value={name} onValue={setName} />
              </div>
              <div className="field">
                <label className="field-label">Base URL</label>
                <UxpTextField className="field-input mono" placeholder="https://api.example.com" value={baseUrl} onValue={setBaseUrl} />
                <div className="field-hint">{t.settings.baseUrlHint}</div>
              </div>
              <div className="field">
                <label className="field-label">{t.settings.defaultModel}</label>
                <UxpTextField className="field-input mono" placeholder="gpt-image-2" value={defaultModel} onValue={setDefaultModel} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">API Key</label>
                <div className="pw-wrap">
                  <UxpTextField
                    type={showKey ? 'text' : 'password'}
                    className="field-input mono"
                    placeholder="sk-..."
                    value={apiKey}
                    onValue={setApiKey}
                  />
                  <button className="pw-toggle" onClick={() => setShowKey((shown) => !shown)}>
                    <Icon name={showKey ? 'eye-off' : 'eye'} />
                  </button>
                </div>
              </div>
            </div>
            <div className="test-area">
              <button className="test-btn" disabled={busy} onClick={() => void handleTest()}>
                {busy
                  ? <><Icon name="spinner" size={13} className="spin" /> {t.settings.testingConnection}</>
                  : t.settings.testConnection
                }
              </button>
              {status && <StatusNotice tone={status.tone} message={status.message} />}
            </div>
          </div>
        )}
      </div>

      {step === 2 && (
        <footer className="det-footer">
          <button className="btn-save" disabled={busy} onClick={() => void handleSave()}>{t.common.save}</button>
          <button
            className="btn-cancel"
            onClick={() => onNav('settings')}
          >
            {t.common.cancel}
          </button>
        </footer>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { providerConfigFromForm, useProviderCatalog } from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { StatusNotice } from '../components/status-notice';
import { useI18n } from '../i18n/i18n-context';
import { Button, ActionButton, TextField, FieldLabel, HelpText } from '../primitives/spectrum-controls';
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
    <div className="page page-enter settings-page">
      <header className="hdr">
        <ActionButton
          data-testid="add-provider-back-button"
          className="hdr-btn"
          quiet
          onClick={() => (step === 1 ? onNav('settings') : setStep(1))}
        >
          <Icon name="chevron-left" slot="icon" />
        </ActionButton>
        <div className="hdr-title">{step === 1 ? t.common.addProvider : selected?.displayName}</div>
        <div style={{ width: 32 }} />
      </header>

      <div className="scroll scroll-footer-pad">
        {step === 1 ? (
          <div>
            <div className="sec-lbl" style={{ paddingTop: 16 }}>{t.settings.chooseType}</div>
            {providers.map((provider) => (
              <div
                key={provider.id}
                data-testid={`provider-type-${provider.id}`}
                className="provider-type-row"
                onClick={() => {
                  setProviderId(provider.id);
                  setName(nextAlias(provider.displayName, profiles));
                  setBaseUrl(defaultBaseUrl(provider.id));
                  setStep(2);
                }}
              >
                <div className="provider-type-leading">
                  <div className="provider-type-badge">
                    {provider.displayName.slice(0, 2).toUpperCase()}
                  </div>
                </div>
                <div className="provider-type-content">
                  <div className="provider-type-name">{provider.displayName}</div>
                  <div className="provider-type-family">{provider.family}</div>
                </div>
                <div className="provider-type-trail">
                  <Icon name="chevron-right" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div className="section">
              <div className="section-title">{t.settings.config}</div>
              <div className="field">
                <FieldLabel htmlFor="provider-alias-input">{t.settings.alias}</FieldLabel>
                <TextField data-testid="provider-alias-input" id="provider-alias-input" className="field-input swc-field" placeholder={selected?.displayName} value={name} onValue={setName} />
              </div>
              <div className="field">
                <FieldLabel htmlFor="provider-base-url-input">Base URL</FieldLabel>
                <TextField data-testid="provider-base-url-input" id="provider-base-url-input" className="field-input mono swc-field" placeholder="https://api.example.com" value={baseUrl} onValue={setBaseUrl} />
                <HelpText className="field-hint">{t.settings.baseUrlHint}</HelpText>
              </div>
              <div className="field">
                <FieldLabel htmlFor="provider-default-model-input">{t.settings.defaultModel}</FieldLabel>
                <TextField
                  data-testid="provider-default-model-input"
                  id="provider-default-model-input"
                  className="field-input mono swc-field"
                  placeholder="gpt-image-2"
                  value={defaultModel}
                  onValue={setDefaultModel}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <FieldLabel htmlFor="provider-api-key-input">API Key</FieldLabel>
                <div className="field-input-affordance">
                  <TextField
                    data-testid="provider-api-key-input"
                    id="provider-api-key-input"
                    type={showKey ? 'text' : 'password'}
                    className="field-input mono swc-field field-input-embedded"
                    placeholder="sk-..."
                    value={apiKey}
                    onValue={setApiKey}
                  />
                  <ActionButton
                    data-testid="provider-api-key-toggle"
                    className="field-input-action"
                    quiet
                    onClick={() => setShowKey((shown) => !shown)}
                  >
                    <Icon name={showKey ? 'eye-off' : 'eye'} slot="icon" />
                  </ActionButton>
                </div>
              </div>
            </div>
            <div className="test-area">
              <Button data-testid="provider-test-button" className="test-btn swc-button" disabled={busy} onClick={() => void handleTest()}>
                {busy
                  ? (
                    <span className="ui-button-content">
                      <Icon name="spinner" size={13} className="ui-icon-text-icon spin" />
                      <span className="ui-button-label">{t.settings.testingConnection}</span>
                    </span>
                  )
                  : (
                    <span className="ui-button-content">
                      <Icon name="check" size={13} className="ui-icon-text-icon" />
                      <span className="ui-button-label">{t.settings.testConnection}</span>
                    </span>
                  )
                }
              </Button>
              {status && <StatusNotice tone={status.tone} message={status.message} />}
            </div>
          </div>
        )}
      </div>

      {step === 2 && (
        <footer className="det-footer">
          <Button data-testid="provider-save-button" className="btn-save swc-button" variant="accent" disabled={busy} onClick={() => void handleSave()}>{t.common.save}</Button>
          <Button
            className="btn-cancel swc-button"
            variant="secondary"
            onClick={() => onNav('settings')}
          >
            {t.common.cancel}
          </Button>
        </footer>
      )}
    </div>
  );
}

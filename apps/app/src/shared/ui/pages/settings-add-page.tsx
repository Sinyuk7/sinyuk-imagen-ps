import { useMemo, useState } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { providerConfigFromForm, useProviderCatalog } from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { MotionContent } from '../components/motion-ui';
import { ProviderProfileEditor } from '../components/provider-profile-editor';
import { useI18n } from '../i18n/i18n-context';
import { Button, ActionButton, TextField, FieldLabel } from '../primitives/native-controls';
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
          label={t.common.back}
          onClick={() => (step === 1 ? onNav('settings') : setStep(1))}
        >
          <Icon name="chevron-left" />
        </ActionButton>
        <div className="hdr-title">{step === 1 ? t.common.addProvider : selected?.displayName}</div>
        <div style={{ width: 32 }} />
      </header>

      <div className="scroll scroll-footer-pad">
        {step === 1 ? (
          <div>
            <div className="sec-lbl" style={{ paddingTop: 16 }}>{t.settings.chooseType}</div>
            {providers.map((provider) => (
              <MotionContent key={provider.id} watch={provider.id}>
                <div
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
              </MotionContent>
            ))}
          </div>
        ) : (
          <ProviderProfileEditor
            connectionTitle={t.settings.config}
            aliasValue={name}
            onAliasValue={setName}
            aliasPlaceholder={selected?.displayName}
            baseUrlValue={baseUrl}
            onBaseUrlValue={setBaseUrl}
            baseUrlPlaceholder="https://api.example.com"
            apiKeyValue={apiKey}
            onApiKeyValue={setApiKey}
            apiKeyPlaceholder="sk-..."
            showKey={showKey}
            onShowKeyChange={setShowKey}
            defaultModelSection={(
              <div className="field">
                <FieldLabel htmlFor="provider-default-model-input">{t.settings.defaultModel}</FieldLabel>
                <TextField
                  data-testid="provider-default-model-input"
                  id="provider-default-model-input"
                  className="field-input mono ui-field-control"
                  placeholder="gpt-image-2"
                  value={defaultModel}
                  onValue={setDefaultModel}
                />
              </div>
            )}
            testBusy={busy}
            onTest={() => void handleTest()}
            testStatus={status}
          />
        )}
      </div>

      {step === 2 && (
        <footer className="det-footer">
          <Button data-testid="provider-save-button" className="btn-save ui-button-block" variant="accent" disabled={busy} onClick={() => void handleSave()}>{t.common.save}</Button>
          <Button
            className="btn-cancel ui-button-block"
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

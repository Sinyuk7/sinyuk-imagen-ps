import { useEffect, useMemo, useRef, useState } from 'react';
import type { EndpointProbeResult, ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import {
  billingFieldError,
  billingModeOptions,
  connectionProbeResultById,
  defaultBillingDraft,
  normalizeProviderConnectionDraft,
  providerConfigFromForm,
  useProviderCatalog,
  type ProviderBillingDraft,
  type ProviderConnectionDraft,
} from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { MotionContent } from '../components/motion-ui';
import { ProviderBillingSettings } from '../components/provider-billing-settings';
import { TextSelect } from '../components/text-select';
import { useNotice } from '../components/notice';
import { ProviderProfileEditor } from '../components/provider-profile-editor';
import { useI18n } from '../i18n/i18n-context';
import { Button, TextField, HelpText } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { statusFromEndpointProbeResult } from '../provider-status';

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

function defaultConnection(providerId: string): ProviderConnectionDraft {
  return normalizeProviderConnectionDraft({
    selectionMode: 'manual',
    failoverEnabled: false,
    preferredEndpointId: 'primary',
    endpoints: [{
      id: 'primary',
      url: defaultBaseUrl(providerId),
      enabled: true,
    }],
  });
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
  const [connection, setConnection] = useState<ProviderConnectionDraft>(defaultConnection(providers[0]?.id ?? ''));
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [billing, setBilling] = useState<ProviderBillingDraft>(defaultBillingDraft(providers[0]));
  const [billingModeMenuOpen, setBillingModeMenuOpen] = useState(false);
  const [modelMode, setModelMode] = useState<'list' | 'custom'>('list');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [probeResults, setProbeResults] = useState<readonly EndpointProbeResult[]>([]);
  const [suggestedEndpointId, setSuggestedEndpointId] = useState<string | undefined>();
  const modelModeTouchedRef = useRef(false);
  const statusNotice = useNotice({ defaultDurationMs: null });
  const selected = useMemo(() => providers.find((provider) => provider.id === providerId), [providerId, providers]);
  const modelOptions = useMemo(
    () => (selected?.defaultModels ?? []).map((model) => ({
      id: model.id,
      label: model.displayName ?? model.id,
    })),
    [selected],
  );

  useEffect(() => {
    modelModeTouchedRef.current = false;
  }, [providerId]);

  useEffect(() => {
    if (modelModeTouchedRef.current) {
      return;
    }
    setModelMode(modelOptions.length > 0 ? 'list' : 'custom');
  }, [modelOptions]);

  useEffect(() => {
    setBilling(defaultBillingDraft(selected));
    setBillingModeMenuOpen(false);
  }, [selected]);

  const saveProfile = async (): Promise<string> => {
    if (!selected) {
      throw new Error(t.settings.selectProviderType);
    }
    const displayName = name.trim() || nextAlias(selected.displayName, profiles);
    const validation = billingFieldError(billing, selected);
    if (validation === 'user-id') {
      throw new Error(t.settings.billingValidationUserId);
    }
    if (validation === 'token') {
      throw new Error(t.settings.billingValidationAccessToken);
    }
    const result = await services.commands.saveProviderProfile({
      profileId,
      providerId: selected.id,
      displayName,
      enabled: true,
      config: providerConfigFromForm(selected.id, displayName, selected.family, connection, defaultModel, billing),
      ...((apiKey.trim() || billing.accessToken.trim())
        ? {
            secretValues: {
              ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
              ...(billing.accessToken.trim() ? { billingAccessToken: billing.accessToken.trim() } : {}),
            },
          }
        : {}),
    });
    if (!result.ok) {
      throw new Error(`${result.error.category}: ${result.error.message}`);
    }
    return result.value.profileId;
  };

  const handleSave = async () => {
    setBusy(true);
    statusNotice.clear();
    try {
      const profileId = await saveProfile();
      await onProfileSaved(profileId);
    } catch (error) {
      statusNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    statusNotice.clear();
    try {
      if (!selected) {
        throw new Error(t.settings.selectProviderType);
      }
      const displayName = name.trim() || nextAlias(selected.displayName, profiles);
      const validation = billingFieldError(billing, selected);
      if (validation === 'user-id') {
        throw new Error(t.settings.billingValidationUserId);
      }
      if (validation === 'token') {
        throw new Error(t.settings.billingValidationAccessToken);
      }
      const result = await services.commands.probeProfileEndpoints({
        profileId,
        providerId: selected.id,
        displayName,
        config: providerConfigFromForm(selected.id, displayName, selected.family, connection, defaultModel, billing),
        ...(apiKey.trim() ? { secretValues: { apiKey: apiKey.trim() } } : {}),
      });
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      setProbeResults(result.value.results);
      setSuggestedEndpointId(result.value.suggestedEndpointId);
      const status = statusFromEndpointProbeResult(result.value, t);
      statusNotice.show(status.message, status.tone, status);
    } catch (error) {
      statusNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-enter settings-page">
      <header className="hdr">
        <IconButton
          data-testid="add-provider-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => (step === 1 ? onNav('settings') : setStep(1))}
        />
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
                    setConnection(defaultConnection(provider.id));
                    modelModeTouchedRef.current = false;
                    setDefaultModel('');
                    setBilling(defaultBillingDraft(provider));
                    setBillingModeMenuOpen(false);
                    setModelMenuOpen(false);
                    setProbeResults([]);
                    setSuggestedEndpointId(undefined);
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
            connection={connection}
            onConnectionChange={(next) => {
              setConnection((current) => normalizeProviderConnectionDraft(typeof next === 'object' ? next : current));
              setProbeResults([]);
              setSuggestedEndpointId(undefined);
            }}
            baseUrlPlaceholder="https://api.example.com"
            probeResults={connectionProbeResultById(probeResults)}
            suggestedEndpointId={suggestedEndpointId}
            apiKeyValue={apiKey}
            onApiKeyValue={setApiKey}
            apiKeyPlaceholder="sk-..."
            showKey={showKey}
            onShowKeyChange={setShowKey}
            extraSections={(
              <div className="section">
                <div className="section-title">{t.settings.billing}</div>
                <ProviderBillingSettings
                  billing={billing}
                  onBillingChange={setBilling}
                  billingModeOptions={billingModeOptions(selected)}
                  modeMenuOpen={billingModeMenuOpen}
                  onModeMenuOpenChange={setBillingModeMenuOpen}
                  disabled={busy}
                />
              </div>
            )}
            defaultModelSection={(
              <div className="field">
                {modelMode === 'list' && modelOptions.length > 0 ? (
                  <TextSelect
                    label={t.settings.defaultModel}
                    value={modelOptions.find((option) => option.id === defaultModel)?.label ?? t.settings.chooseFromList}
                    disabled={busy}
                    open={modelMenuOpen}
                    onOpenChange={setModelMenuOpen}
                    options={modelOptions}
                    selectedId={defaultModel}
                    onSelect={(id) => {
                      modelModeTouchedRef.current = true;
                      setDefaultModel(id);
                      setModelMode('list');
                      setModelMenuOpen(false);
                    }}
                    testId="provider-default-model-selector"
                    triggerId="provider-default-model-selector"
                    containerClassName="cmp-select cmp-select-model provider-model-select"
                    menuClassName="cmp-select-menu cmp-select-menu-model"
                  />
                ) : (
                  <TextField
                    data-testid="provider-default-model-input"
                    id="provider-default-model-input"
                    aria-label={t.settings.defaultModel}
                    className="field-input mono ui-field-control"
                    placeholder={selected?.defaultModels?.[0]?.id ?? 'gpt-image-2'}
                    value={defaultModel}
                    onValue={(value) => {
                      modelModeTouchedRef.current = true;
                      setModelMode('custom');
                      setDefaultModel(value);
                    }}
                  />
                )}
                {modelOptions.length > 0 && (
                  <div className="provider-model-mode-row">
                    <HelpText className="field-hint provider-model-mode-tip">
                      {modelMode === 'list' ? t.settings.customModelHint : t.settings.chooseFromListHint}
                    </HelpText>
                    <button
                      type="button"
                      className="provider-model-mode-link"
                      disabled={busy}
                      onClick={() => {
                        modelModeTouchedRef.current = true;
                        setModelMode(modelMode === 'list' ? 'custom' : 'list');
                        setModelMenuOpen(false);
                      }}
                    >
                      {modelMode === 'list' ? t.settings.useCustomModelId : t.settings.chooseFromList}
                    </button>
                  </div>
                )}
              </div>
            )}
            testBusy={busy}
            onTest={() => void handleTest()}
            testStatus={statusNotice.notice}
          />
        )}
      </div>

      {step === 2 && (
        <footer className="det-footer">
          <Button data-testid="provider-save-button" className="btn-save ui-button-block" variant="accent" disabled={busy} onClick={() => void handleSave()}>{t.common.save}</Button>
          <Button
            className="btn-cancel"
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

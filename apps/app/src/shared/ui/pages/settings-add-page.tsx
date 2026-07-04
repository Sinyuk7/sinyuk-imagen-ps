import { useEffect, useMemo, useRef, useState } from 'react';
import type { EndpointMeasurementResult, ProviderDescriptor, ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import {
  billingFieldError,
  billingModeOptions,
  connectionProbeResultById,
  defaultBillingDraft,
  normalizeProviderConnectionDraft,
  providerConfigFromForm,
  sanitizeProviderDisplayName,
  sanitizeProviderSecretValue,
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
import { StatusNotice } from '../components/status-notice';
import { useI18n } from '../i18n/i18n-context';
import type { AppMessages } from '../i18n/messages';
import { Button, Checkbox, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import {
  statusFromEndpointMeasurementResult,
  statusFromProviderConnectionTestResult,
} from '../provider-status';

interface SettingsAddPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly onProfileSaved: (profileId: string, options: { readonly useProvider: boolean }) => Promise<void>;
}

type ConnectionUpdater = (connection: ProviderConnectionDraft) => ProviderConnectionDraft;
type BillingUpdater = (billing: ProviderBillingDraft) => ProviderBillingDraft;

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
    selectedEndpointId: 'primary',
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
  for (let index = 2; ; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

function aliasFromEndpointUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^(www|api)\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function duplicateEndpointErrors(
  connection: ProviderConnectionDraft,
  message: string,
): ReadonlyMap<string, string> {
  const seen = new Map<string, string>();
  const errors = new Map<string, string>();
  for (const endpoint of connection.endpoints) {
    const key = endpoint.url.trim().replace(/\/+$/, '').toLowerCase();
    if (!key) {
      continue;
    }
    const previousId = seen.get(key);
    if (previousId) {
      errors.set(previousId, message);
      errors.set(endpoint.id, message);
      continue;
    }
    seen.set(key, endpoint.id);
  }
  return errors;
}

function sortProviderTypes(providers: readonly ProviderDescriptor[]): readonly ProviderDescriptor[] {
  return [...providers].sort((left, right) => {
    if (left.id === 'mock' && right.id !== 'mock') return 1;
    if (right.id === 'mock' && left.id !== 'mock') return -1;
    return 0;
  });
}

function providerTypeHint(provider: ProviderDescriptor, messages: AppMessages['settings']): string | null {
  if (provider.id === 'mock') return messages.providerTypeHintMock;
  if (provider.id === 'chat-image') return messages.providerTypeHintChatImage;
  if (provider.family === 'image-endpoint') return messages.providerTypeHintImageEndpoint;
  if (provider.family === 'chat-image') return messages.providerTypeHintChatImage;
  return null;
}

export function SettingsAddPage({ onNav, profiles, onProfileSaved }: SettingsAddPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const providers = useProviderCatalog(services);
  const providerTypeOptions = useMemo(() => sortProviderTypes(providers), [providers]);
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
  const [saveBusy, setSaveBusy] = useState(false);
  const [measurementBusy, setMeasurementBusy] = useState(false);
  const [connectionTestBusy, setConnectionTestBusy] = useState(false);
  const [measurementResults, setMeasurementResults] = useState<readonly EndpointMeasurementResult[]>([]);
  const [resolvedEndpointId, setResolvedEndpointId] = useState<string | undefined>();
  const modelModeTouchedRef = useRef(false);
  const nameTouchedRef = useRef(false);
  const connectionRef = useRef(connection);
  const billingRef = useRef(billing);
  const draftRevisionRef = useRef(0);
  const saveBusyRef = useRef(false);
  const measurementBusyRef = useRef(false);
  const connectionTestBusyRef = useRef(false);
  const measurementNotice = useNotice({ defaultDurationMs: null });
  const connectionNotice = useNotice({ defaultDurationMs: null });
  const selected = useMemo(() => providers.find((provider) => provider.id === providerId), [providerId, providers]);
  const measurementSupported = selected?.connectivity?.endpointMeasurement !== 'unsupported';
  const connectionTestSupported = selected?.connectivity?.connectionTest !== 'unsupported';
  const modelOptions = useMemo(
    () => (selected?.defaultModels ?? []).map((model) => ({
      id: model.id,
      label: model.displayName ?? model.id,
    })),
    [selected],
  );
  const normalizedName = sanitizeProviderDisplayName(name);
  const aliasError = normalizedName && profiles.some((profile) => profile.displayName.trim() === normalizedName)
    ? t.settings.duplicateDisplayName(normalizedName)
    : null;
  const endpointErrors = duplicateEndpointErrors(connection, t.settings.duplicateEndpointUrl);
  const saveDisabled = saveBusy || Boolean(aliasError) || endpointErrors.size > 0;
  const useProviderOnSave = profiles.length === 0;

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
    const nextBilling = defaultBillingDraft(selected);
    billingRef.current = nextBilling;
    setBilling(nextBilling);
    setBillingModeMenuOpen(false);
  }, [selected]);

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  useEffect(() => {
    billingRef.current = billing;
  }, [billing]);

  const invalidateDraftProofs = () => {
    draftRevisionRef.current += 1;
    if (measurementResults.length > 0 || connectionNotice.notice || measurementNotice.notice) {
      measurementNotice.show(t.settings.changesNotTested, 'warning', { durationMs: null, copyable: false });
    }
    connectionNotice.clear();
    setMeasurementResults([]);
    setResolvedEndpointId(undefined);
  };

  const buildDraftCommandInput = (
    nextConnection: ProviderConnectionDraft = connectionRef.current,
    nextBilling: ProviderBillingDraft = billingRef.current,
  ) => {
    if (!selected) {
      throw new Error(t.settings.selectProviderType);
    }
    const displayName = sanitizeProviderDisplayName(name) || nextAlias(selected.displayName, profiles);
    const validation = billingFieldError(nextBilling, selected);
    if (validation === 'user-id') {
      throw new Error(t.settings.billingValidationUserId);
    }
    if (validation === 'token') {
      throw new Error(t.settings.billingValidationAccessToken);
    }
    return {
      profileId,
      providerId: selected.id,
      displayName,
      config: providerConfigFromForm(selected.id, displayName, selected.family, nextConnection, defaultModel, nextBilling),
      ...(sanitizeProviderSecretValue(apiKey) ? { secretValues: { apiKey: sanitizeProviderSecretValue(apiKey) } } : {}),
    };
  };

  const handleMeasure = async (nextConnection: ProviderConnectionDraft = connectionRef.current) => {
    if (measurementBusyRef.current || !selected) {
      return;
    }
    measurementBusyRef.current = true;
    const revision = draftRevisionRef.current;
    setMeasurementBusy(true);
    measurementNotice.clear();
    try {
      const result = await services.commands.measureProfileEndpoints({
        ...buildDraftCommandInput(nextConnection, billingRef.current),
        currentResolvedEndpointId: resolvedEndpointId,
      });
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      if (draftRevisionRef.current === revision) {
        setMeasurementResults(result.value.results);
        setResolvedEndpointId(result.value.resolvedEndpointId);
        const status = statusFromEndpointMeasurementResult(result.value, t);
        measurementNotice.show(status.message, status.tone, status);
      }
    } catch (error) {
      if (draftRevisionRef.current === revision) {
        measurementNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
      }
    } finally {
      measurementBusyRef.current = false;
      setMeasurementBusy(false);
    }
  };

  const handleTestConnection = async () => {
    if (connectionTestBusyRef.current || !selected) {
      return;
    }
    connectionTestBusyRef.current = true;
    setConnectionTestBusy(true);
    connectionNotice.clear();
    try {
      const result = await services.commands.testProviderProfileConnection(buildDraftCommandInput());
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      const status = statusFromProviderConnectionTestResult(result.value, t);
      connectionNotice.show(status.message, status.tone, status);
    } catch (error) {
      connectionNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
    } finally {
      connectionTestBusyRef.current = false;
      setConnectionTestBusy(false);
    }
  };

  const applyConnectionChange = (updater: ConnectionUpdater) => {
    const previous = connectionRef.current;
    const normalizedConnection = normalizeProviderConnectionDraft(updater(connectionRef.current));
    connectionRef.current = normalizedConnection;
    setConnection(normalizedConnection);
    if (!nameTouchedRef.current) {
      const generatedAlias = aliasFromEndpointUrl(normalizedConnection.endpoints.find((endpoint) => endpoint.url.trim())?.url ?? '');
      if (generatedAlias) {
        setName(nextAlias(generatedAlias, profiles));
      }
    }
    invalidateDraftProofs();
    if (
      previous.selectionMode !== 'auto' &&
      normalizedConnection.selectionMode === 'auto' &&
      selected?.connectivity?.endpointMeasurement !== 'unsupported' &&
      normalizedConnection.endpoints.some((endpoint) => endpoint.enabled && endpoint.url.trim())
    ) {
      void handleMeasure(normalizedConnection);
    }
  };

  const applyBillingChange = (updater: BillingUpdater) => {
    const nextBilling = updater(billingRef.current);
    billingRef.current = nextBilling;
    setBilling(nextBilling);
    invalidateDraftProofs();
  };

  const saveProfile = async (): Promise<string> => {
    if (!selected) {
      throw new Error(t.settings.selectProviderType);
    }
    const displayName = sanitizeProviderDisplayName(name) || nextAlias(selected.displayName, profiles);
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
      ...((sanitizeProviderSecretValue(apiKey) || sanitizeProviderSecretValue(billing.accessToken))
        ? {
            secretValues: {
              ...(sanitizeProviderSecretValue(apiKey) ? { apiKey: sanitizeProviderSecretValue(apiKey) } : {}),
              ...(sanitizeProviderSecretValue(billing.accessToken) ? { billingAccessToken: sanitizeProviderSecretValue(billing.accessToken) } : {}),
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
    if (saveBusyRef.current) {
      return;
    }
    saveBusyRef.current = true;
    setSaveBusy(true);
    connectionNotice.clear();
    try {
      const profileId = await saveProfile();
      await onProfileSaved(profileId, { useProvider: useProviderOnSave });
    } catch (error) {
      connectionNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
    } finally {
      saveBusyRef.current = false;
      setSaveBusy(false);
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
            <div className="provider-type-guide">{t.settings.providerTypeGuide}</div>
            {providerTypeOptions.map((provider) => {
              const hint = providerTypeHint(provider, t.settings);
              return (
                <MotionContent key={provider.id} watch={provider.id}>
                  <div
                    data-testid={`provider-type-${provider.id}`}
                    className="provider-type-row"
                    onClick={() => {
                      setProviderId(provider.id);
                      setName(nextAlias(provider.displayName, profiles));
                      nameTouchedRef.current = false;
                      const nextConnection = defaultConnection(provider.id);
                      connectionRef.current = nextConnection;
                      setConnection(nextConnection);
                      modelModeTouchedRef.current = false;
                      setDefaultModel('');
                      const nextBilling = defaultBillingDraft(provider);
                      billingRef.current = nextBilling;
                      setBilling(nextBilling);
                      setBillingModeMenuOpen(false);
                      setModelMenuOpen(false);
                      measurementNotice.clear();
                      connectionNotice.clear();
                      setMeasurementResults([]);
                      setResolvedEndpointId(undefined);
                      draftRevisionRef.current += 1;
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
                      {hint ? <div className="provider-type-hint">{hint}</div> : null}
                    </div>
                    <div className="provider-type-trail">
                      <Icon name="chevron-right" />
                    </div>
                  </div>
                </MotionContent>
              );
            })}
          </div>
        ) : (
          <>
            <ProviderProfileEditor
              connectionTitle={t.settings.config}
              aliasValue={name}
              onAliasValue={(value) => {
                nameTouchedRef.current = true;
                setName(value);
              }}
              aliasError={aliasError}
              aliasPlaceholder={selected?.displayName}
              connection={connection}
              onConnectionChange={applyConnectionChange}
              baseUrlPlaceholder="https://api.example.com"
              endpointErrors={endpointErrors}
              measurementResults={connectionProbeResultById(measurementResults)}
              resolvedEndpointId={resolvedEndpointId}
              measurementBusy={measurementBusy}
              measurementSupported={measurementSupported}
              onMeasure={() => void handleMeasure()}
              measurementNotice={measurementNotice.notice}
              apiKeyValue={apiKey}
              onApiKeyValue={(value) => {
                setApiKey(sanitizeProviderSecretValue(value));
                invalidateDraftProofs();
              }}
              apiKeyPlaceholder="sk-..."
              showKey={showKey}
              onShowKeyChange={setShowKey}
              apiKeySaved={false}
              disabled={saveBusy}
            />
          <div className="section">
            <div className="section-title settings-section-heading">{t.settings.defaultModel}</div>
            <div className="field">
              {modelMode === 'list' && modelOptions.length > 0 ? (
                <TextSelect
                  label={t.settings.defaultModel}
                  value={modelOptions.find((option) => option.id === defaultModel)?.label ?? t.settings.chooseFromList}
                  disabled={saveBusy}
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
                  disabled={saveBusy}
                  onValue={(value) => {
                    modelModeTouchedRef.current = true;
                    setModelMode('custom');
                    setDefaultModel(value);
                    invalidateDraftProofs();
                  }}
                />
              )}
              {modelOptions.length > 0 && (
                <div className="provider-model-mode-row">
                  <Checkbox
                    data-testid="provider-use-custom-model-checkbox"
                    checked={modelMode === 'custom'}
                    onChecked={(checked) => {
                      modelModeTouchedRef.current = true;
                      setModelMode(checked ? 'custom' : 'list');
                      setModelMenuOpen(false);
                      invalidateDraftProofs();
                    }}
                  >
                    {t.settings.useCustomModelId}
                  </Checkbox>
                </div>
              )}
            </div>
          </div>
          <div className="section">
            <div className="section-title settings-section-heading">{t.settings.billing}</div>
            <ProviderBillingSettings
              billing={billing}
              onBillingChange={applyBillingChange}
              billingModeOptions={billingModeOptions(selected)}
              modeMenuOpen={billingModeMenuOpen}
              onModeMenuOpenChange={setBillingModeMenuOpen}
              disabled={saveBusy}
              accessTokenPlaceholder="sk-..."
            />
          </div>
        </>)}
      </div>

      {step === 2 && (
        <footer className="det-footer settings-add-footer">
          <div className="settings-detail-footer-inner settings-add-footer-inner">
            <div className="settings-detail-footer-actions">
              <IconButton
                data-testid="provider-test-button"
                className="settings-icon-button"
                compactSquare
                disabled={saveBusy || connectionTestBusy || !connectionTestSupported}
                icon={connectionTestBusy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="network" size={16} />}
                tooltip={!connectionTestSupported ? t.settings.providerConnectionUnsupported : connectionTestBusy ? t.settings.testingConnection : t.settings.testConnection}
                aria-label={!connectionTestSupported ? t.settings.providerConnectionUnsupported : connectionTestBusy ? t.settings.testingConnection : t.settings.testConnection}
                onClick={() => void handleTestConnection()}
              />
              {connectionNotice.notice ? (
                <StatusNotice
                  tone={connectionNotice.notice.tone}
                  message={connectionNotice.notice.message}
                  detail={'detail' in connectionNotice.notice ? connectionNotice.notice.detail : null}
                  detailCopyable={'detailCopyable' in connectionNotice.notice ? connectionNotice.notice.detailCopyable : false}
                />
              ) : null}
            </div>
            <div className="settings-detail-footer-save-group settings-add-footer-save-group">
              <Button data-testid="provider-save-button" className="btn-save" variant="accent" disabled={saveDisabled} onClick={() => void handleSave()}>{saveBusy ? t.settings.saving : t.settings.saveProvider}</Button>
              <Button
                className="btn-cancel"
                variant="secondary"
                onClick={() => onNav('settings')}
              >
                {t.common.cancel}
              </Button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

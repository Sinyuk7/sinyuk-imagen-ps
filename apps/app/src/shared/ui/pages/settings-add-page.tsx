import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiFormat, EndpointClassification, EndpointMeasurementResult, ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import {
  apiFormatLabel,
  billingFieldError,
  billingModeOptions,
  connectionProbeResultById,
  defaultApiPathDraft,
  defaultBillingDraft,
  descriptorForApiFormat,
  mergeApiPathDraft,
  normalizeProviderConnectionDraft,
  providerConfigFromForm,
  sanitizeProviderDisplayName,
  sanitizeProviderEndpointUrl,
  sanitizeProviderSecretValue,
  useProviderCatalog,
  type ApiPathDraft,
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
import { Button, Checkbox, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
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

function defaultConnection(): ProviderConnectionDraft {
  return normalizeProviderConnectionDraft({
    selectionMode: 'manual',
    selectedEndpointId: 'primary',
    endpoints: [{
      id: 'primary',
      url: '',
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

function replaceEndpointUrl(
  connection: ProviderConnectionDraft,
  endpointId: string,
  url: string,
): ProviderConnectionDraft {
  return {
    ...connection,
    endpoints: connection.endpoints.map((endpoint) => (
      endpoint.id === endpointId ? { ...endpoint, url } : endpoint
    )),
  };
}

export function SettingsAddPage({ onNav, profiles, onProfileSaved }: SettingsAddPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const providers = useProviderCatalog(services);
  const [profileId] = useState(createProfileId);
  const [apiFormat, setApiFormat] = useState<ApiFormat | null>(null);
  const [paths, setPaths] = useState<ApiPathDraft>(defaultApiPathDraft(null));
  const [detectionValue, setDetectionValue] = useState('');
  const [apiFormatFeedback, setApiFormatFeedback] = useState<{ readonly tone: 'neutral' | 'positive' | 'negative' | 'warning'; readonly message: string } | null>(null);
  const [name, setName] = useState('');
  const [connection, setConnection] = useState<ProviderConnectionDraft>(defaultConnection());
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [billing, setBilling] = useState<ProviderBillingDraft>(defaultBillingDraft(undefined));
  const [billingModeMenuOpen, setBillingModeMenuOpen] = useState(false);
  const [authModeMenuOpen, setAuthModeMenuOpen] = useState(false);
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
  const selected = useMemo(() => descriptorForApiFormat(providers, apiFormat), [apiFormat, providers]);
  const measurementSupported = Boolean(selected && selected.connectivity?.endpointMeasurement !== 'unsupported');
  const connectionTestSupported = Boolean(selected && selected.connectivity?.connectionTest !== 'unsupported');
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
  const saveDisabled = saveBusy || !apiFormat || Boolean(aliasError) || endpointErrors.size > 0;
  const useProviderOnSave = profiles.length === 0;

  useEffect(() => {
    modelModeTouchedRef.current = false;
  }, [apiFormat]);

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

  const applyClassification = (
    classification: EndpointClassification,
    rawValue: string,
    nextConnection: ProviderConnectionDraft,
    endpointId?: string,
    previousConnection?: ProviderConnectionDraft,
  ): ProviderConnectionDraft => {
    if (classification.status === 'unsupported') {
      const trimmed = rawValue.trim();
      if (/^https?:\/\//i.test(trimmed) && !apiFormat) {
        setApiFormatFeedback({ tone: 'warning', message: t.settings.apiFormatNeedsPath });
      } else if (trimmed.length > 0 && !apiFormat) {
        setApiFormatFeedback({ tone: 'negative', message: t.settings.apiFormatUnsupported });
      }
      return nextConnection;
    }

    if (apiFormat && apiFormat !== classification.apiFormat) {
      setApiFormatFeedback({
        tone: 'negative',
        message: t.settings.apiFormatConflict(apiFormatLabel(apiFormat), apiFormatLabel(classification.apiFormat)),
      });
      return previousConnection ?? nextConnection;
    }

    setApiFormat(classification.apiFormat);
    setPaths((current) => mergeApiPathDraft(
      apiFormat ? current : defaultApiPathDraft(classification.apiFormat),
      classification.paths,
      classification.apiFormat,
    ));
    if (classification.status === 'supported') {
      setApiFormatFeedback({ tone: 'positive', message: t.settings.apiFormatDetected(apiFormatLabel(classification.apiFormat)) });
    } else {
      setApiFormatFeedback({ tone: 'warning', message: t.settings.apiFormatIncomplete(apiFormatLabel(classification.apiFormat)) });
    }
    if (classification.status === 'supported' && classification.extractedModel && !modelModeTouchedRef.current && !defaultModel.trim()) {
      setDefaultModel(classification.extractedModel);
      setModelMode('custom');
    }
    if (!endpointId) {
      return nextConnection;
    }
    if (classification.source === 'full-url' && classification.baseUrl) {
      if (!nameTouchedRef.current) {
        const generatedAlias = aliasFromEndpointUrl(classification.baseUrl);
        if (generatedAlias) {
          setName(nextAlias(generatedAlias, profiles));
        }
      }
      return replaceEndpointUrl(nextConnection, endpointId, classification.baseUrl);
    }
    if (classification.source === 'path') {
      const previousUrl = previousConnection?.endpoints.find((endpoint) => endpoint.id === endpointId)?.url ?? '';
      return replaceEndpointUrl(nextConnection, endpointId, previousUrl);
    }
    return nextConnection;
  };

  const applyDetectionInput = (value: string) => {
    const sanitized = sanitizeProviderEndpointUrl(value);
    setDetectionValue(sanitized);
    const primaryEndpoint = connectionRef.current.endpoints[0];
    const classification = services.commands.classifyEndpoint(sanitized);
    const nextConnection = classification.status !== 'unsupported' && classification.source === 'full-url' && classification.baseUrl && primaryEndpoint
      ? replaceEndpointUrl(connectionRef.current, primaryEndpoint.id, classification.baseUrl)
      : connectionRef.current;
    const applied = primaryEndpoint
      ? applyClassification(classification, sanitized, nextConnection, primaryEndpoint.id, connectionRef.current)
      : nextConnection;
    connectionRef.current = applied;
    setConnection(applied);
    invalidateDraftProofs();
  };

  const buildDraftCommandInput = (
    nextConnection: ProviderConnectionDraft = connectionRef.current,
    nextBilling: ProviderBillingDraft = billingRef.current,
  ) => {
    if (!apiFormat) {
      throw new Error(t.settings.apiFormatRequired);
    }
    const displayName = sanitizeProviderDisplayName(name) || nextAlias(apiFormatLabel(apiFormat), profiles);
    const validation = billingFieldError(nextBilling, selected);
    if (validation === 'user-id') {
      throw new Error(t.settings.billingValidationUserId);
    }
    if (validation === 'token') {
      throw new Error(t.settings.billingValidationAccessToken);
    }
    return {
      profileId,
      apiFormat,
      displayName,
      config: providerConfigFromForm(apiFormat, displayName, nextConnection, defaultModel, paths, nextBilling),
      ...(sanitizeProviderSecretValue(apiKey) ? { secretValues: { apiKey: sanitizeProviderSecretValue(apiKey) } } : {}),
    };
  };

  const handleMeasure = async (nextConnection: ProviderConnectionDraft = connectionRef.current) => {
    if (measurementBusyRef.current || !apiFormat) {
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
    if (connectionTestBusyRef.current || !apiFormat) {
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
    let normalizedConnection = normalizeProviderConnectionDraft(updater(connectionRef.current));
    const changedEndpoint = normalizedConnection.endpoints.find((endpoint) => {
      const previousEndpoint = previous.endpoints.find((item) => item.id === endpoint.id);
      return previousEndpoint && previousEndpoint.url !== endpoint.url;
    });
    if (changedEndpoint) {
      const classification = services.commands.classifyEndpoint(changedEndpoint.url);
      normalizedConnection = applyClassification(classification, changedEndpoint.url, normalizedConnection, changedEndpoint.id, previous);
    }
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
    if (!apiFormat) {
      throw new Error(t.settings.apiFormatRequired);
    }
    const displayName = sanitizeProviderDisplayName(name) || nextAlias(apiFormatLabel(apiFormat), profiles);
    const validation = billingFieldError(billing, selected);
    if (validation === 'user-id') {
      throw new Error(t.settings.billingValidationUserId);
    }
    if (validation === 'token') {
      throw new Error(t.settings.billingValidationAccessToken);
    }
    const result = await services.commands.saveProviderProfile({
      profileId,
      apiFormat,
      displayName,
      enabled: true,
      config: providerConfigFromForm(apiFormat, displayName, connection, defaultModel, paths, billing),
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

  const updatePath = (next: Partial<ApiPathDraft>) => {
    setPaths((current) => ({ ...current, ...next }));
    invalidateDraftProofs();
  };

  const renderPathSettings = () => {
    if (!apiFormat) {
      return null;
    }
    const authOptions = [
      { id: 'x-goog-api-key', label: 'x-goog-api-key' },
      { id: 'bearer', label: 'Bearer' },
      { id: 'none', label: 'None' },
    ];
    return (
      <div className="section">
        <div className="section-title settings-section-heading">{t.settings.advancedSettings}</div>
        {apiFormat === 'openai-images' ? (
          <>
            <div className="field">
              <FieldLabel htmlFor="provider-generation-path-input">{t.settings.generationPath}</FieldLabel>
              <TextField
                data-testid="provider-generation-path-input"
                id="provider-generation-path-input"
                className="field-input mono ui-field-control"
                value={paths.generation}
                disabled={saveBusy}
                onValue={(value) => updatePath({ generation: value })}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="provider-edit-path-input">{t.settings.editPath}</FieldLabel>
              <TextField
                data-testid="provider-edit-path-input"
                id="provider-edit-path-input"
                className="field-input mono ui-field-control"
                value={paths.edit}
                disabled={saveBusy}
                onValue={(value) => updatePath({ edit: value })}
              />
            </div>
            <HelpText className="field-hint">{t.settings.authModeFixedBearer}</HelpText>
          </>
        ) : null}
        {apiFormat === 'openai-chat-completions' ? (
          <>
            <div className="field">
              <FieldLabel htmlFor="provider-invoke-path-input">{t.settings.invokePath}</FieldLabel>
              <TextField
                data-testid="provider-invoke-path-input"
                id="provider-invoke-path-input"
                className="field-input mono ui-field-control"
                value={paths.invoke}
                disabled={saveBusy}
                onValue={(value) => updatePath({ invoke: value })}
              />
            </div>
            <HelpText className="field-hint">{t.settings.authModeFixedBearer}</HelpText>
          </>
        ) : null}
        {apiFormat === 'gemini-generate-content' ? (
          <>
            <div className="field">
              <FieldLabel htmlFor="provider-invoke-template-input">{t.settings.invokePathTemplate}</FieldLabel>
              <TextField
                data-testid="provider-invoke-template-input"
                id="provider-invoke-template-input"
                className="field-input mono ui-field-control"
                value={paths.invokeTemplate}
                disabled={saveBusy}
                onValue={(value) => updatePath({ invokeTemplate: value })}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="provider-auth-mode-selector">{t.settings.authMode}</FieldLabel>
              <TextSelect
                label={t.settings.authMode}
                value={authOptions.find((option) => option.id === paths.authMode)?.label ?? paths.authMode}
                disabled={saveBusy}
                open={authModeMenuOpen}
                onOpenChange={setAuthModeMenuOpen}
                options={authOptions}
                selectedId={paths.authMode}
                onSelect={(id) => {
                  updatePath({ authMode: id as ApiPathDraft['authMode'] });
                  setAuthModeMenuOpen(false);
                }}
                testId="provider-auth-mode-selector"
                triggerId="provider-auth-mode-selector"
                containerClassName="cmp-select cmp-select-model provider-model-select"
                menuClassName="cmp-select-menu cmp-select-menu-model"
              />
            </div>
          </>
        ) : null}
      </div>
    );
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
          onClick={() => onNav('settings')}
        />
        <div className="hdr-title">{t.common.addProvider}</div>
        <div style={{ width: 32 }} />
      </header>

      <div className="scroll scroll-footer-pad">
        <MotionContent watch={apiFormat ?? 'auto'}>
            <ProviderProfileEditor
              connectionTitle={t.settings.config}
              aliasValue={name}
              onAliasValue={(value) => {
                nameTouchedRef.current = true;
                setName(value);
              }}
              aliasError={aliasError}
              aliasPlaceholder={apiFormat ? apiFormatLabel(apiFormat) : t.settings.apiProfile}
              apiFormatLabel={apiFormatLabel(apiFormat)}
              apiFormatTone={apiFormatFeedback?.tone ?? (apiFormat ? 'positive' : 'neutral')}
              apiFormatDetail={apiFormatFeedback?.message ?? (!apiFormat ? t.settings.apiFormatNeedsPath : null)}
              detectInputValue={detectionValue}
              onDetectInputValue={applyDetectionInput}
              pathSettings={renderPathSettings()}
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
        </MotionContent>
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
      </div>

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
    </div>
  );
}

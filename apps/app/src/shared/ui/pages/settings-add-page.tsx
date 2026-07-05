import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiFormat, ProviderModelInfo, ProviderProfile } from '@imagen-ps/application';
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
  providerProfileUpsertCapabilities,
  providerConfigFromForm,
  sanitizeProviderDisplayName,
  sanitizeProviderEndpointUrl,
  sanitizeProviderSecretValue,
  useProviderDraftModelCatalog,
  useProviderCatalog,
  type ApiPathDraft,
  type ProviderBillingDraft,
  type ProviderConnectionDraft,
} from '../hooks/use-provider-settings';
import { ProviderBillingSettings } from '../components/provider-billing-settings';
import {
  ProviderAdvancedPathSection,
  ProviderDefaultModelSection,
  ProviderSettingsFooter,
  ProviderSettingsPageHeader,
} from '../components/provider-settings-sections';
import { useToast } from '../components/toast-host';
import { ProviderProfileEditor } from '../components/provider-profile-editor';
import { useI18n } from '../i18n/i18n-context';
import {
  statusFromEndpointMeasurementResult,
  statusFromProviderConnectionTestResult,
} from '../provider-status';
import { importDetectionFallbackMessage, importProviderEndpointInput } from '../hooks/provider-endpoint-import';

interface SettingsAddPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly onProfileSaved: (profileId: string, options: { readonly useProvider: boolean; readonly message: string }) => Promise<void>;
}

type ConnectionUpdater = (connection: ProviderConnectionDraft) => ProviderConnectionDraft;
type BillingUpdater = (billing: ProviderBillingDraft) => ProviderBillingDraft;

function createProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `profile-${crypto.randomUUID()}`;
  }
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function selectedModelInput(defaultModel: string): {
  readonly selectedModelIds?: readonly string[];
  readonly defaultModelId?: string;
} {
  const modelId = defaultModel.trim();
  return modelId.length > 0
    ? { selectedModelIds: [modelId], defaultModelId: modelId }
    : {};
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

export function SettingsAddPage({ onNav, profiles, onProfileSaved }: SettingsAddPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const { show } = useToast();
  const providers = useProviderCatalog(services);
  const [profileId] = useState(createProfileId);
  const [apiFormat, setApiFormat] = useState<ApiFormat | null>(null);
  const [paths, setPaths] = useState<ApiPathDraft>(defaultApiPathDraft(null));
  const [detectionValue, setDetectionValue] = useState('');
  const [apiFormatFeedback, setApiFormatFeedback] = useState<{ readonly tone: 'neutral' | 'positive' | 'negative' | 'warning'; readonly message: string } | null>(null);
  const [name, setName] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [connection, setConnection] = useState<ProviderConnectionDraft>(defaultConnection());
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [billing, setBilling] = useState<ProviderBillingDraft>(defaultBillingDraft(undefined));
  const [billingModeMenuOpen, setBillingModeMenuOpen] = useState(false);
  const [authModeMenuOpen, setAuthModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [connectionTestBusy, setConnectionTestBusy] = useState(false);
  const nameTouchedRef = useRef(false);
  const connectionRef = useRef(connection);
  const billingRef = useRef(billing);
  const saveBusyRef = useRef(false);
  const connectionTestBusyRef = useRef(false);
  const selected = useMemo(() => descriptorForApiFormat(providers, apiFormat), [apiFormat, providers]);
  const capabilities = providerProfileUpsertCapabilities(null);
  const measurementSupported = Boolean(selected && selected.connectivity?.endpointMeasurement !== 'unsupported');
  const connectionTestSupported = Boolean(selected && selected.connectivity?.connectionTest !== 'unsupported');
  const normalizedName = sanitizeProviderDisplayName(name);
  const aliasError = normalizedName && profiles.some((profile) => profile.displayName.trim() === normalizedName)
    ? t.settings.duplicateDisplayName(normalizedName)
    : null;
  const endpointErrors = duplicateEndpointErrors(connection, t.settings.duplicateEndpointUrl);
  const saveDisabled = saveBusy || !apiFormat || Boolean(aliasError) || endpointErrors.size > 0;
  const useProviderOnSave = profiles.length === 0;

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

  const modelCatalog = useProviderDraftModelCatalog({
    services,
    persistedProfileId: null,
    configuredDefaultModel: defaultModel,
    descriptorDefaultModels: selected?.defaultModels as readonly ProviderModelInfo[] | undefined,
    discoverySupported: measurementSupported,
    canRefreshPersistedModelCache: capabilities.canRefreshPersistedModelCache,
    isDraftDirty: Boolean(apiFormat),
    resetKey: `${apiFormat ?? 'none'}:${profileId}`,
    refreshDraftModels: async () => services.commands.refreshDraftProfileModels(
      buildDraftCommandInput(connectionRef.current, billingRef.current),
    ),
  });

  const modelOptions = modelCatalog.options;
  const invalidateDraftProofs = () => {
    modelCatalog.invalidate();
  };

  const applyImportedEndpoint = async (
    rawValue: string,
    nextConnection: ProviderConnectionDraft,
    endpointId?: string,
    previousConnection?: ProviderConnectionDraft,
  ): Promise<ProviderConnectionDraft> => {
    const imported = importProviderEndpointInput({
      rawValue,
      apiFormat,
      currentPaths: paths,
      currentConnection: nextConnection,
      endpointId,
      previousConnection,
      profiles,
      nameTouched: nameTouchedRef.current,
      defaultModel,
      defaultPathsForApiFormat: defaultApiPathDraft,
      mergeApiPathDraft,
      classifyEndpoint: services.commands.classifyEndpoint,
      normalizeBaseUrlIntoConnection: true,
    });
    const feedback = importDetectionFallbackMessage({
      classification: imported.classification,
      rawValue,
      currentApiFormat: apiFormat,
      messages: {
        apiFormatNeedsPath: t.settings.apiFormatNeedsPath,
        apiFormatUnsupported: t.settings.apiFormatUnsupported,
        apiFormatDetected: t.settings.apiFormatDetected,
        apiFormatIncomplete: t.settings.apiFormatIncomplete,
        apiFormatConflict: t.settings.apiFormatConflict,
      },
    });
    if (feedback) {
      setApiFormatFeedback(feedback);
    }
    if (imported.classification.status === 'unsupported') {
      return nextConnection;
    }
    if (apiFormat && imported.classification.apiFormat !== apiFormat) {
      return previousConnection ?? nextConnection;
    }
    setApiFormat(imported.nextApiFormat);
    setPaths(imported.nextPaths);
    if (imported.suggestedAlias) {
      setName(imported.suggestedAlias);
    }
    await services.diagnostics?.checkpoint('uxp.ui.settings_add.endpoint_import', {
      apiFormatBefore: apiFormat,
      apiFormatAfter: imported.nextApiFormat,
      aliasApplied: imported.diagnostics.aliasApplied,
      aliasCandidate: imported.diagnostics.aliasCandidate ?? null,
      aliasSkippedReason: imported.diagnostics.aliasSkippedReason ?? null,
      importedModel: imported.diagnostics.importedModel ?? null,
      classificationStatus: imported.classification.status,
      classificationSource: imported.classification.source,
    }, {
      ...(imported.nextApiFormat ? { api_format: imported.nextApiFormat } : {}),
    });
    return imported.nextConnection;
  };

  const applyDetectionInput = (value: string) => {
    const sanitized = sanitizeProviderEndpointUrl(value);
    setDetectionValue(sanitized);
    const primaryEndpoint = connectionRef.current.endpoints[0];
    void (async () => {
      const applied = primaryEndpoint
        ? await applyImportedEndpoint(sanitized, connectionRef.current, primaryEndpoint.id, connectionRef.current)
        : connectionRef.current;
      connectionRef.current = applied;
      setConnection(applied);
      invalidateDraftProofs();
    })();
  };

  const buildDraftCommandInput = (
    nextConnection: ProviderConnectionDraft = connectionRef.current,
    nextBilling: ProviderBillingDraft = billingRef.current,
  ) => {
    if (!apiFormat) {
      throw new Error(t.settings.apiFormatRequired);
    }
    const displayName = sanitizeProviderDisplayName(name) || apiFormatLabel(apiFormat);
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
      systemInstruction,
      config: providerConfigFromForm(apiFormat, displayName, nextConnection, defaultModel, paths, nextBilling),
      ...selectedModelInput(defaultModel),
      ...(sanitizeProviderSecretValue(apiKey) ? { secretValues: { apiKey: sanitizeProviderSecretValue(apiKey) } } : {}),
    };
  };

  const handleMeasure = async (nextConnection: ProviderConnectionDraft = connectionRef.current) => {
    if (!apiFormat) {
      return;
    }
    try {
      const result = await services.commands.measureProfileEndpoints({
        ...buildDraftCommandInput(nextConnection, billingRef.current),
        currentResolvedEndpointId: modelCatalog.resolvedEndpointId,
      });
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      modelCatalog.applyProbeResult(result.value);
      const status = statusFromEndpointMeasurementResult(result.value, t);
      show(status.message, status.tone, {
        key: 'settings-add-endpoint-probe',
        durationMs: status.durationMs,
        dismissible: status.dismissible,
        copyable: status.copyable,
      });
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', {
        key: 'settings-add-endpoint-probe-error',
        durationMs: null,
        copyable: true,
      });
    }
  };

  const handleTestConnection = async () => {
    if (connectionTestBusyRef.current || !apiFormat) {
      return;
    }
    connectionTestBusyRef.current = true;
    setConnectionTestBusy(true);
    try {
      const result = await services.commands.testProviderProfileConnection(buildDraftCommandInput());
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      modelCatalog.applyConnectionTestResult(result.value);
      const status = statusFromProviderConnectionTestResult(result.value, t);
      show(status.message, status.tone, {
        key: 'settings-add-connection-test',
        durationMs: status.durationMs,
        dismissible: status.dismissible,
        copyable: status.copyable,
      });
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', {
        key: 'settings-add-connection-test-error',
        durationMs: null,
        copyable: true,
      });
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
      void (async () => {
        const imported = importProviderEndpointInput({
          rawValue: changedEndpoint.url,
          apiFormat,
          currentPaths: paths,
          currentConnection: normalizedConnection,
          endpointId: changedEndpoint.id,
          previousConnection: previous,
          profiles,
          nameTouched: nameTouchedRef.current,
          defaultModel,
          defaultPathsForApiFormat: defaultApiPathDraft,
          mergeApiPathDraft,
          classifyEndpoint: services.commands.classifyEndpoint,
          normalizeBaseUrlIntoConnection: false,
        });
        const feedback = importDetectionFallbackMessage({
          classification: imported.classification,
          rawValue: changedEndpoint.url,
          currentApiFormat: apiFormat,
          messages: {
            apiFormatNeedsPath: t.settings.apiFormatNeedsPath,
            apiFormatUnsupported: t.settings.apiFormatUnsupported,
            apiFormatDetected: t.settings.apiFormatDetected,
            apiFormatIncomplete: t.settings.apiFormatIncomplete,
            apiFormatConflict: t.settings.apiFormatConflict,
          },
        });
        if (feedback) {
          setApiFormatFeedback(feedback);
        }
        if (imported.classification.status !== 'unsupported' && (!apiFormat || imported.classification.apiFormat === apiFormat)) {
          setApiFormat(imported.nextApiFormat);
          setPaths(imported.nextPaths);
          if (imported.suggestedAlias) {
            setName(imported.suggestedAlias);
          }
          await services.diagnostics?.checkpoint('uxp.ui.settings_add.endpoint_import', {
            apiFormatBefore: apiFormat,
            apiFormatAfter: imported.nextApiFormat,
            aliasApplied: imported.diagnostics.aliasApplied,
            aliasCandidate: imported.diagnostics.aliasCandidate ?? null,
            aliasSkippedReason: imported.diagnostics.aliasSkippedReason ?? null,
            importedModel: imported.diagnostics.importedModel ?? null,
            classificationStatus: imported.classification.status,
            classificationSource: imported.classification.source,
          }, {
            ...(imported.nextApiFormat ? { api_format: imported.nextApiFormat } : {}),
          });
        }
        const applied = normalizedConnection;
        connectionRef.current = applied;
        setConnection(applied);
        invalidateDraftProofs();
        if (
          previous.selectionMode !== 'auto' &&
          applied.selectionMode === 'auto' &&
          selected?.connectivity?.endpointMeasurement !== 'unsupported' &&
          applied.endpoints.some((endpoint) => endpoint.enabled && endpoint.url.trim())
        ) {
          void handleMeasure(applied);
        }
      })();
      return;
    }
    connectionRef.current = normalizedConnection;
    setConnection(normalizedConnection);
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
    const displayName = sanitizeProviderDisplayName(name) || apiFormatLabel(apiFormat);
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
      systemInstruction,
      enabled: true,
      config: providerConfigFromForm(apiFormat, displayName, connection, defaultModel, paths, billing),
      ...selectedModelInput(defaultModel),
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
    try {
      const profileId = await saveProfile();
      await onProfileSaved(profileId, { useProvider: useProviderOnSave, message: t.settings.saved });
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', {
        key: 'settings-add-save-error',
        durationMs: null,
        copyable: true,
      });
    } finally {
      saveBusyRef.current = false;
      setSaveBusy(false);
    }
  };

  const updatePath = (next: Partial<ApiPathDraft>) => {
    setPaths((current) => ({ ...current, ...next }));
    invalidateDraftProofs();
  };

  return (
    <div className="page page-enter settings-page">
      <ProviderSettingsPageHeader
        backButtonTestId="add-provider-back-button"
        title={t.common.addProvider}
        onBack={() => onNav('settings')}
      />

      <div className="scroll scroll-footer-pad">
        <ProviderProfileEditor
          connectionTitle={t.settings.config}
          aliasValue={name}
          onAliasValue={(value) => {
            nameTouchedRef.current = true;
            setName(value);
          }}
          aliasError={aliasError}
          aliasPlaceholder={apiFormat ? apiFormatLabel(apiFormat) : t.settings.apiProfile}
          systemInstructionValue={systemInstruction}
          onSystemInstructionValue={setSystemInstruction}
          apiFormatLabel={apiFormatLabel(apiFormat)}
          apiFormatTone={apiFormatFeedback?.tone ?? (apiFormat ? 'positive' : 'neutral')}
          apiFormatDetail={apiFormatFeedback?.message ?? (!apiFormat ? t.settings.apiFormatNeedsPath : null)}
          detectInputValue={detectionValue}
          onDetectInputValue={applyDetectionInput}
          pathSettings={(
            <ProviderAdvancedPathSection
              apiFormat={apiFormat}
              paths={paths}
              authModeMenuOpen={authModeMenuOpen}
              disabled={saveBusy}
              onAuthModeMenuOpenChange={setAuthModeMenuOpen}
              onPathChange={updatePath}
            />
          )}
          connection={connection}
          onConnectionChange={applyConnectionChange}
          baseUrlPlaceholder="https://api.example.com"
          endpointErrors={endpointErrors}
          measurementResults={connectionProbeResultById(modelCatalog.measurementResults)}
          resolvedEndpointId={modelCatalog.resolvedEndpointId}
          measurementBusy={modelCatalog.refreshBusy}
          measurementSupported={measurementSupported}
          onMeasure={() => void handleMeasure()}
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
          <ProviderDefaultModelSection
            disabled={saveBusy}
            loading={modelCatalog.loading}
            discoverySupported={measurementSupported}
            modelMenuOpen={modelMenuOpen}
            modelOptions={modelOptions}
            defaultModel={defaultModel}
            triggerValue={modelOptions.find((option) => option.id === defaultModel)?.label ?? t.settings.chooseFromList}
            modelFieldHelp={
              !measurementSupported
                ? {
                    id: 'provider-model-discovery-help',
                    testId: 'provider-model-discovery-help',
                    message: t.settings.modelDiscoveryFieldHelp,
                  }
                : null
            }
            listNotice={
              modelCatalog.stale
                  ? { tone: 'warning', message: t.settings.modelListStale }
                  : modelOptions.length === 0
                    ? { tone: 'info', message: t.settings.modelListEmpty }
                    : null
            }
            onRefresh={() => void modelCatalog.refresh()}
            onModelMenuOpenChange={setModelMenuOpen}
            onDefaultModelSelect={(id) => {
              setDefaultModel(id);
              setModelMenuOpen(false);
              invalidateDraftProofs();
            }}
          />
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

      <ProviderSettingsFooter
        footerClassName="det-footer settings-add-footer"
        innerClassName="settings-detail-footer-inner settings-add-footer-inner"
        saveGroupClassName="settings-detail-footer-save-group settings-add-footer-save-group"
        testBusy={connectionTestBusy}
        saveBusy={saveBusy}
        testSupported={connectionTestSupported}
        saveDisabled={saveDisabled}
        onTest={() => void handleTestConnection()}
        onSave={() => void handleSave()}
      />
    </div>
  );
}

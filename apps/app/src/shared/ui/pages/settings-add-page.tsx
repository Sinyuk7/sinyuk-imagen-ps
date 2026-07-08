import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiFormat, ProviderProfile, UserModelConfig } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import {
  apiFormatLabel,
  billingFieldError,
  billingModeOptions,
  billingSecretValuesFromDraft,
  connectionProbeResultById,
  defaultApiPathDraft,
  defaultBillingDraft,
  descriptorForApiFormat,
  mergeApiPathDraft,
  normalizeProviderConnectionDraft,
  providerConfigFromForm,
  sanitizeBillingPath,
  sanitizeProviderDisplayName,
  sanitizeProviderEndpointUrl,
  sanitizeProviderSecretValue,
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
import { userModelConfigVisibleLabel } from '../model-info';

interface SettingsAddPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly onProfileSaved: (profileId: string, options: { readonly useProvider: boolean; readonly message: string }) => Promise<void>;
  readonly onOpenModelConfiguration?: (input: {
    readonly source: 'profile-add';
    readonly apiFormat: ProviderProfile['apiFormat'];
    readonly modelId?: string | null;
  }) => void;
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
  readonly selectedModelIds: readonly string[];
  readonly defaultModelId?: string;
} {
  const modelId = defaultModel.trim();
  return modelId.length > 0
    ? { selectedModelIds: [modelId], defaultModelId: modelId }
    : { selectedModelIds: [] };
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

function liveTextInputValue(inputId: string): string | undefined {
  const element = document.getElementById(inputId);
  if (element instanceof HTMLInputElement) {
    return element.value;
  }
  return undefined;
}

export function SettingsAddPage({ onNav, profiles, onProfileSaved, onOpenModelConfiguration }: SettingsAddPageProps) {
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
  const [modelOptions, setModelOptions] = useState<readonly { readonly id: string; readonly label: string }[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null);
  const nameTouchedRef = useRef(false);
  const connectionRef = useRef(connection);
  const billingRef = useRef(billing);
  const saveBusyRef = useRef(false);
  const connectionTestBusyRef = useRef(false);
  const selected = useMemo(() => descriptorForApiFormat(providers, apiFormat), [apiFormat, providers]);
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

  const invalidateDraftProofs = () => undefined;

  const syncLiveApiKeyValue = (current: string): string => {
    const live = liveTextInputValue('provider-api-key-input');
    if (live === undefined) {
      return current;
    }
    const next = sanitizeProviderSecretValue(live);
    if (next !== current) {
      setApiKey(next);
      return next;
    }
    return current;
  };

  const syncLiveBillingDraft = (current: ProviderBillingDraft): ProviderBillingDraft => {
    let next = current;
    const path = liveTextInputValue('provider-billing-path-input');
    if (path !== undefined) {
      const normalized = sanitizeBillingPath(path);
      if (normalized !== next.path) {
        next = { ...next, path: normalized };
      }
    }
    if (next.source === 'billing-token') {
      const userId = liveTextInputValue('provider-billing-user-id-input');
      if (userId !== undefined) {
        const normalized = sanitizeProviderSecretValue(userId);
        if (normalized !== next.userId) {
          next = { ...next, userId: normalized };
        }
      }
      const token = liveTextInputValue('provider-billing-access-token-input');
      if (token !== undefined) {
        const normalized = sanitizeProviderSecretValue(token);
        if (normalized !== next.token) {
          next = { ...next, token: normalized };
        }
      }
    }
    if (next !== current) {
      billingRef.current = next;
      setBilling(next);
    }
    return next;
  };

  const syncVisibleDraftInputs = (): void => {
    syncLiveApiKeyValue(apiKey);
    syncLiveBillingDraft(billingRef.current);
  };

  useEffect(() => {
    if (!apiFormat) {
      setModelOptions([]);
      setModelOptionsLoading(false);
      setModelOptionsError(null);
      return;
    }
    let cancelled = false;
    setModelOptionsLoading(true);
    void Promise.all([
      services.commands.listUserModelConfigs(apiFormat),
      services.commands.listOfficialModelConfigPresets(apiFormat),
    ])
      .then(([
        result,
        presetsResult,
      ]: readonly [
        Awaited<ReturnType<typeof services.commands.listUserModelConfigs>>,
        Awaited<ReturnType<typeof services.commands.listOfficialModelConfigPresets>>,
      ]) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setModelOptions([]);
          setModelOptionsError(`${result.error.category}: ${result.error.message}`);
          return;
        }
        if (!presetsResult.ok) {
          setModelOptions([]);
          setModelOptionsError(`${presetsResult.error.category}: ${presetsResult.error.message}`);
          return;
        }
        const officialDisplayNames = new Map(
          presetsResult.value.map((preset) => [preset.modelId, preset.displayName] as const),
        );
        const nextOptions = result.value.map((config: UserModelConfig) => ({
          id: config.modelId,
          label: userModelConfigVisibleLabel(config, officialDisplayNames),
        }));
        setModelOptions(nextOptions);
        setModelOptionsError(null);
        if (defaultModel && !nextOptions.some((option) => option.id === defaultModel)) {
          setDefaultModel('');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setModelOptions([]);
        setModelOptionsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setModelOptionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiFormat, defaultModel, services.commands]);

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
    nextBilling: ProviderBillingDraft = syncLiveBillingDraft(billingRef.current),
  ) => {
    if (!apiFormat) {
      throw new Error(t.settings.apiFormatRequired);
    }
    const currentApiKey = syncLiveApiKeyValue(apiKey);
    const displayName = sanitizeProviderDisplayName(name) || apiFormatLabel(apiFormat);
    const validation = billingFieldError(nextBilling, selected, { currentApiKey, hasSavedApiKey: false });
    if (validation === 'path') {
      throw new Error(t.settings.billingValidationPath);
    }
    if (validation === 'api-key') {
      throw new Error(t.settings.billingValidationApiKey);
    }
    if (validation === 'token') {
      throw new Error(t.settings.billingValidationAccessToken);
    }
    if (validation === 'unsupported') {
      throw new Error(t.settings.billingNotSupported);
    }
    const billingSecretValues = billingSecretValuesFromDraft(nextBilling);
    return {
      profileId,
      apiFormat,
      displayName,
      systemInstruction,
      config: providerConfigFromForm(apiFormat, displayName, nextConnection, defaultModel, paths, nextBilling),
      ...selectedModelInput(defaultModel),
      ...((currentApiKey.trim() || billingSecretValues)
        ? {
            secretValues: {
              ...(currentApiKey.trim() ? { apiKey: currentApiKey.trim() } : {}),
              ...(billingSecretValues ?? {}),
            },
          }
        : {}),
    };
  };

  const handleMeasure = async (nextConnection: ProviderConnectionDraft = connectionRef.current) => {
    if (!apiFormat) {
      return;
    }
    try {
      const result = await services.commands.measureProfileEndpoints({
        ...buildDraftCommandInput(nextConnection, billingRef.current),
      });
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
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
    const currentApiKey = syncLiveApiKeyValue(apiKey);
    const currentBilling = syncLiveBillingDraft(billingRef.current);
    const displayName = sanitizeProviderDisplayName(name) || apiFormatLabel(apiFormat);
    const validation = billingFieldError(currentBilling, selected, { currentApiKey, hasSavedApiKey: false });
    if (validation === 'path') {
      throw new Error(t.settings.billingValidationPath);
    }
    if (validation === 'api-key') {
      throw new Error(t.settings.billingValidationApiKey);
    }
    if (validation === 'token') {
      throw new Error(t.settings.billingValidationAccessToken);
    }
    if (validation === 'unsupported') {
      throw new Error(t.settings.billingNotSupported);
    }
    const billingSecretValues = billingSecretValuesFromDraft(currentBilling);
    const result = await services.commands.saveProviderProfile({
      profileId,
      apiFormat,
      displayName,
      systemInstruction,
      enabled: true,
      config: providerConfigFromForm(apiFormat, displayName, connectionRef.current, defaultModel, paths, currentBilling),
      ...selectedModelInput(defaultModel),
      ...((currentApiKey.trim() || billingSecretValues)
        ? {
            secretValues: {
              ...(currentApiKey.trim() ? { apiKey: currentApiKey.trim() } : {}),
              ...(billingSecretValues ?? {}),
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
          aliasValue={name}
          onAliasValue={(value) => {
            nameTouchedRef.current = true;
            setName(value);
          }}
          aliasError={aliasError}
          aliasPlaceholder={apiFormat ? apiFormatLabel(apiFormat) : t.settings.apiProfile}
          systemInstructionValue={systemInstruction}
          onSystemInstructionValue={setSystemInstruction}
          systemInstructionNativeEditorSuspended={modelMenuOpen}
          apiFormatLabel={apiFormatLabel(apiFormat)}
          apiFormatStatus={apiFormat ? apiFormatLabel(apiFormat) : null}
          apiFormatHint={apiFormatFeedback?.message ?? (!apiFormat ? t.settings.apiFormatNeedsPath : null)}
          apiFormatTone={apiFormat ? 'positive' : (apiFormatFeedback?.tone ?? 'neutral')}
          detectInputValue={detectionValue}
          onDetectInputValue={applyDetectionInput}
          connection={connection}
          onConnectionChange={applyConnectionChange}
          baseUrlPlaceholder="https://api.example.com"
          endpointErrors={endpointErrors}
          measurementResults={connectionProbeResultById([])}
          measurementBusy={false}
          measurementSupported={measurementSupported}
          onMeasure={() => void handleMeasure()}
          defaultModelSection={(
            <ProviderDefaultModelSection
              wrapInSection={false}
              disabled={saveBusy}
              loading={modelOptionsLoading}
              canCreateModelConfig={Boolean(apiFormat)}
              modelMenuOpen={modelMenuOpen}
              modelOptions={modelOptions}
              defaultModel={defaultModel}
              triggerValue={modelOptions.find((option) => option.id === defaultModel)?.label ?? t.settings.chooseFromList}
              modelFieldHelp={null}
              emptyStateNotice={
                modelOptions.length === 0 && apiFormat
                  ? {
                      tone: modelOptionsError ? 'warning' as const : 'info' as const,
                      message: modelOptionsError ? t.settings.modelListFailed : t.settings.modelSelectionEmpty,
                      detail: modelOptionsError ?? t.settings.modelSelectionCreateFirst,
                      actionLabel: t.settings.createModelConfiguration,
                      onAction: () => {
                        onOpenModelConfiguration?.({
                          source: 'profile-add',
                          apiFormat,
                          modelId: null,
                        });
                      },
                    }
                  : null
              }
              onCreateModelConfig={() => {
                if (!apiFormat) {
                  return;
                }
                onOpenModelConfiguration?.({
                  source: 'profile-add',
                  apiFormat,
                  modelId: null,
                });
              }}
              onModelMenuOpenChange={setModelMenuOpen}
              onDefaultModelSelect={(id) => {
                setDefaultModel(id);
                setModelMenuOpen(false);
                invalidateDraftProofs();
              }}
            />
          )}
          balanceSection={(
            <div className="provider-embedded-section">
              <div className="section-title settings-section-heading">{t.settings.billing}</div>
              <ProviderBillingSettings
                billing={billing}
                onBillingChange={applyBillingChange}
                billingModeOptions={billingModeOptions(selected, {
                  disabled: t.common.disabled,
                  profileApiKey: t.settings.billingUseCurrentApiKey,
                  billingToken: t.settings.billingUseBillingToken,
                })}
                modeMenuOpen={billingModeMenuOpen}
                onModeMenuOpenChange={setBillingModeMenuOpen}
                disabled={saveBusy}
                accessTokenPlaceholder="token"
                sourceError={billingFieldError(billing, selected, { currentApiKey: apiKey, hasSavedApiKey: false }) === 'api-key'
                  ? t.settings.billingValidationApiKey
                  : billingFieldError(billing, selected, { currentApiKey: apiKey, hasSavedApiKey: false }) === 'unsupported'
                    ? t.settings.billingNotSupported
                    : null}
                pathError={billingFieldError(billing, selected, { currentApiKey: apiKey, hasSavedApiKey: false }) === 'path'
                  ? t.settings.billingValidationPath
                  : null}
                accessTokenError={billingFieldError(billing, selected, { currentApiKey: apiKey, hasSavedApiKey: false }) === 'token'
                  ? t.settings.billingValidationAccessToken
                  : null}
              />
            </div>
          )}
          apiKeyValue={apiKey}
          onApiKeyValue={(value) => {
            setApiKey(sanitizeProviderSecretValue(value));
            invalidateDraftProofs();
          }}
          apiKeyPlaceholder="sk-..."
          showKey={showKey}
          onShowKeyChange={setShowKey}
          apiKeySaved={false}
          pathSettings={(
            <ProviderAdvancedPathSection
              wrapInSection={false}
              apiFormat={apiFormat}
              paths={paths}
              authModeMenuOpen={authModeMenuOpen}
              disabled={saveBusy}
              onAuthModeMenuOpenChange={setAuthModeMenuOpen}
              onPathChange={updatePath}
            />
          )}
          disabled={saveBusy}
        />
      </div>

      <ProviderSettingsFooter
        footerClassName="det-footer settings-add-footer"
        innerClassName="settings-detail-footer-inner settings-add-footer-inner"
        saveGroupClassName="settings-detail-footer-save-group settings-add-footer-save-group"
        testBusy={connectionTestBusy}
        saveBusy={saveBusy}
        testSupported={connectionTestSupported}
        saveDisabled={saveDisabled}
        onTestMouseDown={syncVisibleDraftInputs}
        onTest={() => void handleTestConnection()}
        onSaveMouseDown={syncVisibleDraftInputs}
        onSave={() => void handleSave()}
      />
    </div>
  );
}

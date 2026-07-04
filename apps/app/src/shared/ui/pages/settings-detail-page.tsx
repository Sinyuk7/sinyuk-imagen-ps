import { useEffect, useRef, useState } from 'react';
import type { ProviderModelInfo, ProviderProfile, ProviderProfileConfig, ProviderProfileConfigValue } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import {
  apiFormatLabel,
  billingFieldError,
  billingModeOptions,
  connectionProbeResultById,
  defaultApiPathDraft,
  descriptorForApiFormat,
  formatBillingDetail,
  mergeApiPathDraft,
  normalizeProviderConnectionDraft,
  providerProfileUpsertCapabilities,
  providerConfigFromForm,
  readApiPathDraft,
  readProviderBillingDraft,
  readProviderConfigString,
  readProviderConnectionDraft,
  resolveProviderModelMode,
  sanitizeProviderDisplayName,
  sanitizeProviderSecretValue,
  useProviderDraftModelCatalog,
  useProfileDetail,
  useProviderCatalog,
  type ApiPathDraft,
  type ProviderBillingDraft,
  type ProviderConnectionDraft,
} from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { ProviderBillingSettings } from '../components/provider-billing-settings';
import { ProviderProfileEditor } from '../components/provider-profile-editor';
import {
  ProviderAdvancedPathSection,
  ProviderDefaultModelSection,
  ProviderSettingsFooter,
  ProviderSettingsPageHeader,
} from '../components/provider-settings-sections';
import { StatusNotice } from '../components/status-notice';
import { useToast } from '../components/toast-host';
import { useI18n } from '../i18n/i18n-context';
import { IconButton } from '../primitives/icon-button';
import {
  statusFromEndpointMeasurementResult,
  statusFromProviderConnectionTestResult,
} from '../provider-status';
import { useProfileBilling } from '../hooks/use-profile-billing';
import { formatBalanceChange, formatBillingPrimary, formatExactTaskCost } from '../../domain/mappers';

interface SettingsDetailPageProps {
  readonly onNav: (view: string) => void;
  readonly profileId: string | null;
  readonly onProfilesChanged: (profileId: string | null) => Promise<void>;
  readonly onSaved?: (message: string) => void;
}

type ConnectionUpdater = (connection: ProviderConnectionDraft) => ProviderConnectionDraft;
type BillingUpdater = (billing: ProviderBillingDraft) => ProviderBillingDraft;

function profileFormCheckpointAttrs(
  profile: ProviderProfile | null,
  form: {
    readonly apiKey: string;
    readonly defaultModel: string;
    readonly billingAccessToken?: string;
  },
): Record<string, unknown> {
  return {
    profileId: profile?.profileId ?? null,
    apiFormat: profile?.apiFormat ?? null,
    configKeyCount: profile ? Object.keys(profile.config).length : 0,
    hasDirtyCredential: form.apiKey.trim().length > 0,
    hasDirtyBillingCredential: (form.billingAccessToken ?? '').trim().length > 0,
    modelIdLength: form.defaultModel.trim().length,
  };
}

function mergeProfileConfigForSave(
  profile: ProviderProfile,
  nextConfig: ProviderProfileConfig,
): ProviderProfileConfig {
  const merged = {
    ...profile.config,
    ...nextConfig,
  } as Record<string, ProviderProfileConfigValue>;
  delete merged.providerId;
  delete merged.family;
  return merged;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeConfigForDraftCompare(config: ProviderProfileConfig): string {
  const normalized: Record<string, unknown> = { ...config };
  const billing = normalized.billing;
  if (
    typeof billing === 'object' &&
    billing !== null &&
    !Array.isArray(billing) &&
    (billing as { readonly mode?: unknown }).mode === 'none'
  ) {
    delete normalized.billing;
  }
  return stableSerialize(normalized);
}

function modelStatusMessage(model: ProviderModelInfo | undefined, messages: ReturnType<typeof useI18n>['messages']): string | null {
  if (!model) {
    return null;
  }
  if (model.supportStatus === 'saved-undiscovered') {
    return messages.settings.modelSavedUndiscovered;
  }
  if (model.supportStatus === 'custom-unchecked') {
    return messages.settings.modelCustomUnchecked;
  }
  return null;
}

function hasDraftChanges(
  profile: ProviderProfile,
  draft: {
    readonly displayName: string;
    readonly connection: ProviderConnectionDraft;
    readonly defaultModel: string;
    readonly paths: ApiPathDraft;
    readonly billing: ProviderBillingDraft;
    readonly apiKey: string;
    readonly apiKeyRemovalPending: boolean;
    readonly billingAccessTokenRemovalPending: boolean;
  },
): boolean {
  if (
    draft.apiKey.trim().length > 0 ||
    draft.billing.accessToken.trim().length > 0 ||
    draft.apiKeyRemovalPending ||
    draft.billingAccessTokenRemovalPending
  ) {
    return true;
  }
  const nextDisplayName = sanitizeProviderDisplayName(draft.displayName) || profile.displayName;
  const nextConfig = mergeProfileConfigForSave(
    profile,
    providerConfigFromForm(
      profile.apiFormat,
      nextDisplayName,
      draft.connection,
      draft.defaultModel,
      draft.paths,
      draft.billing,
    ),
  );
  return (
    nextDisplayName !== profile.displayName ||
    normalizeConfigForDraftCompare(nextConfig) !== normalizeConfigForDraftCompare(profile.config)
  );
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

function billingDraftForSave(
  billing: ProviderBillingDraft,
  removeAccessToken: boolean,
): ProviderBillingDraft {
  return removeAccessToken
    ? { ...billing, accessToken: '', hasSavedAccessToken: false }
    : billing;
}

export function SettingsDetailPage({ onNav, profileId, onProfilesChanged, onSaved }: SettingsDetailPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const providers = useProviderCatalog(services);
  const detail = useProfileDetail(services, profileId);
  const { show } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [connection, setConnection] = useState<ProviderConnectionDraft>(readProviderConnectionDraft(null));
  const [defaultModel, setDefaultModel] = useState('');
  const [paths, setPaths] = useState<ApiPathDraft>(defaultApiPathDraft(null));
  const [billingDraft, setBillingDraft] = useState<ProviderBillingDraft>(readProviderBillingDraft(null));
  const [billingModeMenuOpen, setBillingModeMenuOpen] = useState(false);
  const [authModeMenuOpen, setAuthModeMenuOpen] = useState(false);
  const [billingExpanded, setBillingExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyRemovalPending, setApiKeyRemovalPending] = useState(false);
  const [billingAccessTokenRemovalPending, setBillingAccessTokenRemovalPending] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [connectionTestBusy, setConnectionTestBusy] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMode, setModelMode] = useState<'list' | 'custom'>('list');
  const lastLoadedProfileIdRef = useRef<string | null>(null);
  const modelModeTouchedRef = useRef(false);
  const connectionRef = useRef(connection);
  const billingDraftRef = useRef(billingDraft);
  const saveBusyRef = useRef(false);
  const connectionTestBusyRef = useRef(false);
  const billing = useProfileBilling(services, profileId);
  const busy = saveBusy;
  const providerDescriptor = detail.profile ? descriptorForApiFormat(providers, detail.profile.apiFormat) : undefined;
  const capabilities = providerProfileUpsertCapabilities(detail.profile);
  const measurementSupported = Boolean(providerDescriptor && providerDescriptor.connectivity?.endpointMeasurement !== 'unsupported');
  const connectionTestSupported = Boolean(providerDescriptor && providerDescriptor.connectivity?.connectionTest !== 'unsupported');
  const modelDiscoverySupported = measurementSupported;

  const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
  const billingValidation = billingFieldError(effectiveBillingDraft, providerDescriptor);
  const endpointErrors = duplicateEndpointErrors(connection, t.settings.duplicateEndpointUrl);
  const draftDirty = detail.profile
    ? hasDraftChanges(
        detail.profile,
        {
          displayName,
          connection,
          defaultModel,
          paths,
          billing: billingDraft,
          apiKey,
          apiKeyRemovalPending,
          billingAccessTokenRemovalPending,
        },
      )
    : false;

  function invalidateDraftProofs() {
    modelCatalog.invalidate();
  }

  const updateApiKey = (value: string) => {
    setApiKey(sanitizeProviderSecretValue(value));
    setApiKeyRemovalPending(false);
    invalidateDraftProofs();
  };

  const updateBillingDraft = (updater: BillingUpdater) => {
    const nextBilling = updater(billingDraftRef.current);
    billingDraftRef.current = nextBilling;
    setBillingDraft(nextBilling);
    if (nextBilling.accessToken.trim()) {
      setBillingAccessTokenRemovalPending(false);
    }
    invalidateDraftProofs();
  };

  const updateConnectionDraft = (updater: ConnectionUpdater) => {
    const previous = connectionRef.current;
    let nextConnection = normalizeProviderConnectionDraft(updater(connectionRef.current));
    const changedEndpoint = nextConnection.endpoints.find((endpoint) => {
      const previousEndpoint = previous.endpoints.find((item) => item.id === endpoint.id);
      return previousEndpoint && previousEndpoint.url !== endpoint.url;
    });
    if (changedEndpoint && detail.profile) {
      const classification = services.commands.classifyEndpoint(changedEndpoint.url);
      if (classification.status !== 'unsupported') {
        if (classification.apiFormat !== detail.profile.apiFormat) {
          show(
            t.settings.apiFormatConflict(apiFormatLabel(detail.profile.apiFormat), apiFormatLabel(classification.apiFormat)),
            'negative',
            { durationMs: null, copyable: false },
          );
          nextConnection = previous;
        } else {
          setPaths((current) => mergeApiPathDraft(current, classification.paths, classification.apiFormat));
          if (classification.source === 'full-url' && classification.baseUrl) {
            nextConnection = replaceEndpointUrl(nextConnection, changedEndpoint.id, classification.baseUrl);
          } else if (classification.source === 'path') {
            const previousUrl = previous.endpoints.find((endpoint) => endpoint.id === changedEndpoint.id)?.url ?? '';
            nextConnection = replaceEndpointUrl(nextConnection, changedEndpoint.id, previousUrl);
          }
        }
      }
    }
    connectionRef.current = nextConnection;
    setConnection(nextConnection);
    invalidateDraftProofs();
    if (
      previous.selectionMode !== 'auto' &&
      nextConnection.selectionMode === 'auto' &&
      detail.profile &&
      measurementSupported &&
      nextConnection.endpoints.some((endpoint) => endpoint.enabled && endpoint.url.trim())
    ) {
      void probeEndpoints();
    }
  };

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    setDisplayName(detail.profile.displayName);
    const nextConnection = readProviderConnectionDraft(detail.profile);
    connectionRef.current = nextConnection;
    setConnection(nextConnection);
    setPaths(readApiPathDraft(detail.profile));
    setDefaultModel(readProviderConfigString(detail.profile, 'defaultModel'));
    const nextBillingDraft = readProviderBillingDraft(detail.profile);
    billingDraftRef.current = nextBillingDraft;
    setBillingDraft(nextBillingDraft);
    setBillingModeMenuOpen(false);
    setBillingExpanded(false);
    setApiKey('');
    setApiKeyRemovalPending(false);
    setBillingAccessTokenRemovalPending(false);
    setAliasError(null);
    setModelMenuOpen(false);
 }, [detail.profile]);

  useEffect(() => {
    const nextProfileId = detail.profile?.profileId ?? null;
    if (lastLoadedProfileIdRef.current === nextProfileId) {
      return;
    }
    lastLoadedProfileIdRef.current = nextProfileId;
  }, [detail.profile?.profileId]);

  useEffect(() => {
    modelModeTouchedRef.current = false;
  }, [detail.profile?.profileId]);

  const persistProfile = async (): Promise<ProviderProfile | null> => {
    if (!detail.profile) {
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.persist.no_profile', { profileId });
      return null;
    }
    await services.diagnostics?.checkpoint(
      'uxp.ui.settings_detail.persist.input_prepared',
      profileFormCheckpointAttrs(detail.profile, { apiKey, defaultModel, billingAccessToken: billingDraft.accessToken }),
      {
        profile_id: detail.profile.profileId,
        api_format: detail.profile.apiFormat,
      },
    );
    const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
    const removedSecretNames = [
      ...(apiKeyRemovalPending ? ['apiKey'] : []),
      ...(billingAccessTokenRemovalPending ? ['billingAccessToken'] : []),
    ];
    return detail.save({
      profileId: detail.profile.profileId,
      apiFormat: detail.profile.apiFormat,
      displayName: sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
      enabled: detail.profile.enabled,
      config: mergeProfileConfigForSave(
        detail.profile,
        providerConfigFromForm(
          detail.profile.apiFormat,
          sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
          connection,
          defaultModel,
          paths,
          effectiveBillingDraft,
        ),
      ),
      ...(removedSecretNames.length > 0 ? { removedSecretNames } : {}),
      ...((apiKey.trim() || effectiveBillingDraft.accessToken.trim())
        ? {
            secretValues: {
              ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
              ...(effectiveBillingDraft.accessToken.trim() ? { billingAccessToken: effectiveBillingDraft.accessToken.trim() } : {}),
            },
          }
        : {}),
    });
  };

  const buildDraftCommandInput = () => {
    if (!detail.profile) {
      throw new Error('No provider profile selected.');
    }
    const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
    const removedSecretNames = [
      ...(apiKeyRemovalPending ? ['apiKey'] : []),
      ...(billingAccessTokenRemovalPending ? ['billingAccessToken'] : []),
    ];
    return {
      profileId: detail.profile.profileId,
      apiFormat: detail.profile.apiFormat,
      displayName: sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
      config: mergeProfileConfigForSave(
        detail.profile,
        providerConfigFromForm(
          detail.profile.apiFormat,
          sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
          connection,
          defaultModel,
          paths,
          effectiveBillingDraft,
        ),
      ),
      ...(removedSecretNames.length > 0 ? { removedSecretNames } : {}),
      ...((apiKey.trim() || effectiveBillingDraft.accessToken.trim())
        ? {
            secretValues: {
              ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
              ...(effectiveBillingDraft.accessToken.trim() ? { billingAccessToken: effectiveBillingDraft.accessToken.trim() } : {}),
            },
          }
        : {}),
    };
  };

  const modelCatalog = useProviderDraftModelCatalog({
    services,
    persistedProfileId: detail.profile?.profileId ?? null,
    persistedRevisionKey: detail.profile ? `${detail.profile.updatedAt}:${readProviderConfigString(detail.profile, 'defaultModel')}` : '',
    configuredDefaultModel: defaultModel,
    descriptorDefaultModels: providerDescriptor?.defaultModels,
    discoverySupported: modelDiscoverySupported,
    canRefreshPersistedModelCache: capabilities.canRefreshPersistedModelCache,
    isDraftDirty: draftDirty,
    resetKey: detail.profile ? `${detail.profile.profileId}:${detail.profile.updatedAt}` : 'detail:none',
    refreshDraftModels: async () => services.commands.refreshDraftProfileModels(buildDraftCommandInput()),
  });

  const testCurrentDraftConnection = async () => services.commands.testProviderProfileConnection(buildDraftCommandInput());

  const save = async () => {
    if (saveBusyRef.current) {
      return;
    }
    saveBusyRef.current = true;
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.entered', { profileId });
    setSaveBusy(true);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.busy_set', { busy: true, profileId });
    setAliasError(null);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.status_cleared', { profileId });
    try {
      const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
      const validation = billingFieldError(effectiveBillingDraft, providerDescriptor);
      if (validation === 'user-id') {
        throw new Error(t.settings.billingValidationUserId);
      }
      if (validation === 'token') {
        throw new Error(t.settings.billingValidationAccessToken);
      }
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_persist', { profileId });
      const profile = await persistProfile();
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_persist', {
        profileId: profile?.profileId ?? null,
        apiFormat: profile?.apiFormat ?? null,
        hasProfile: profile !== null,
      }, {
        ...(profile ? { profile_id: profile.profileId, api_format: profile.apiFormat } : {}),
      });
      if (profile) {
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_success_feedback', {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }, {
          profile_id: profile.profileId,
          api_format: profile.apiFormat,
        });
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_success_feedback', {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }, {
          profile_id: profile.profileId,
          api_format: profile.apiFormat,
        });
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_profiles_changed', {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }, {
          profile_id: profile.profileId,
          api_format: profile.apiFormat,
        });
        await onProfilesChanged(profile.profileId);
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_profiles_changed', {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }, {
          profile_id: profile.profileId,
          api_format: profile.apiFormat,
        });
        onSaved?.(t.settings.saved);
        onNav('settings');
      }
    } catch (error) {
      await services.diagnostics?.failure('uxp.ui.settings_detail.save.failed', error, { profileId });
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('displayName')) {
        setAliasError(t.settings.duplicateDisplayName(sanitizeProviderDisplayName(displayName)));
      }
      show(message, 'negative', { key: 'settings-detail-save-error', durationMs: null, copyable: true });
    } finally {
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_busy_clear', { profileId });
      saveBusyRef.current = false;
      setSaveBusy(false);
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_busy_clear', { profileId });
    }
  };

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    void services.diagnostics?.checkpoint('uxp.ui.settings_detail.render.ready', {
      profileId: detail.profile.profileId,
      apiFormat: detail.profile.apiFormat,
      busy,
      hasStatus: false,
      }, {
        profile_id: detail.profile.profileId,
        api_format: detail.profile.apiFormat,
      });
  }, [busy, detail.profile, services.diagnostics]);

  const test = async () => {
    if (connectionTestBusyRef.current) {
      return;
    }
    connectionTestBusyRef.current = true;
    setConnectionTestBusy(true);
    try {
      const result = await testCurrentDraftConnection();
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      modelCatalog.applyConnectionTestResult(result.value);
      const status = statusFromProviderConnectionTestResult(result.value, t);
      show(status.message, status.tone, {
        key: 'settings-detail-connection-test',
        durationMs: status.durationMs,
        dismissible: status.dismissible,
        copyable: status.copyable,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      show(`${t.settings.connectionFailed}: ${detail}`, 'negative', {
        key: 'settings-detail-connection-test-error',
        durationMs: null,
        copyable: true,
      });
    } finally {
      connectionTestBusyRef.current = false;
      setConnectionTestBusy(false);
    }
  };

  const probeEndpoints = async () => {
    try {
      const result = await services.commands.measureProfileEndpoints({
        ...buildDraftCommandInput(),
        currentResolvedEndpointId: modelCatalog.resolvedEndpointId,
      });
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      modelCatalog.applyProbeResult(result.value);
      const status = statusFromEndpointMeasurementResult(result.value, t);
      show(status.message, status.tone, {
        key: 'settings-detail-endpoint-probe',
        durationMs: status.durationMs,
        dismissible: status.dismissible,
        copyable: status.copyable,
      });
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', {
        key: 'settings-detail-endpoint-probe-error',
        durationMs: null,
        copyable: true,
      });
    }
  };

  const refreshModels = async () => {
    try {
      await modelCatalog.refresh();
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', {
        key: 'settings-detail-model-refresh-error',
        durationMs: null,
        copyable: true,
      });
    }
  };

  const modelOptions = modelCatalog.options;

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    if (!modelModeTouchedRef.current) {
      setModelMode(resolveProviderModelMode(defaultModel, modelCatalog.models));
      setModelMenuOpen(false);
    }
  }, [defaultModel, detail.profile, modelCatalog.models]);

  const remove = async () => {
    if (saveBusyRef.current) {
      return;
    }
    saveBusyRef.current = true;
    setSaveBusy(true);
    try {
      await detail.remove();
      await onProfilesChanged(null);
      onNav('settings');
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', { key: 'settings-detail-delete-error', durationMs: null, copyable: true });
    } finally {
      saveBusyRef.current = false;
      setSaveBusy(false);
    }
  };

  const modelSelectionLabel = modelOptions.find((option) => option.id === defaultModel)?.label ?? defaultModel.trim();
  const modelTriggerValue = modelSelectionLabel || t.settings.chooseFromList;
  const selectedModelInfo = modelCatalog.selectedModelInfo;
  const selectedModelStatus = modelStatusMessage(selectedModelInfo, t);
  const saveDisabled = busy || !detail.profile || !draftDirty || endpointErrors.size > 0 || Boolean(aliasError);
  const modelListNotice = modelCatalog.error
    ? {
        tone: 'warning' as const,
        message: t.settings.modelListFailed,
        detail: modelCatalog.error,
        detailCopyable: true,
      }
    : !modelDiscoverySupported
      ? { tone: 'info' as const, message: t.settings.modelDiscoveryUnsupported }
    : modelCatalog.stale
      ? { tone: 'warning' as const, message: t.settings.modelListStale }
    : modelOptions.length === 0
      ? { tone: 'info' as const, message: t.settings.modelListEmpty }
      : null;

  const updatePath = (next: Partial<ApiPathDraft>) => {
    setPaths((current) => ({ ...current, ...next }));
    invalidateDraftProofs();
  };

  const renderBillingSection = () => {
    const balance = formatBillingPrimary(billing.billing);
    const checkedAt = billing.billing?.balance?.checkedAt;
    const isConfigured = Boolean(balance) || billingDraft.mode !== 'none' || Boolean(billing.billing?.balance);
    const summaryParts = [t.settings.billing];
    if (balance) {
      summaryParts.push(`${t.settings.billingBalanceLabel} ${balance}`);
    }
    if (checkedAt) {
      summaryParts.push(`${t.settings.billingCheckedAt} ${new Date(checkedAt).toLocaleString()}`);
    }
    if (!isConfigured) {
      summaryParts.push(t.settings.billingDisabled);
    }
    const summaryText = summaryParts.join(' · ');

    return (
      <div className="section">
        <div
          role="button"
          tabIndex={0}
          data-testid="provider-billing-header"
          className="billing-header"
          onClick={() => setBillingExpanded((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setBillingExpanded((value) => !value);
            }
          }}
        >
          <span className="billing-header-summary">{summaryText}</span>
          <span className="settings-section-header-actions">
            {isConfigured && (
              <IconButton
                data-testid="provider-billing-refresh-button"
                className="settings-icon-button"
                compactSquare
                disabled={billing.loading || busy}
                icon={<Icon name="refresh" size={16} className={billing.billing?.refreshState === 'refreshing' ? 'spin' : undefined} />}
                tooltip={billing.loading ? t.settings.billingRefreshing : t.settings.billingRefresh}
                aria-label={billing.loading ? t.settings.billingRefreshing : t.settings.billingRefresh}
                onClick={(event) => {
                  event.stopPropagation();
                  void billing.refresh();
                }}
              />
            )}
            <IconButton
              data-testid="provider-billing-expand-button"
              className="settings-icon-button"
              compactSquare
              icon={<Icon name={billingExpanded ? 'chevron-down' : 'chevron-right'} size={16} />}
              tooltip={billingExpanded ? t.settings.billingCollapse : t.settings.billingExpand}
              aria-label={billingExpanded ? t.settings.billingCollapse : t.settings.billingExpand}
              onClick={(event) => {
                event.stopPropagation();
                setBillingExpanded((value) => !value);
              }}
            />
          </span>
        </div>
        {billingExpanded && (
          <div className="billing-section billing-section-expanded">
            {!isConfigured && (
              <div className="billing-empty-hint">{t.settings.billingModeHint}</div>
            )}
            <ProviderBillingSettings
              billing={effectiveBillingDraft}
              onBillingChange={updateBillingDraft}
              billingModeOptions={billingModeOptions(providerDescriptor)}
              modeMenuOpen={billingModeMenuOpen}
              onModeMenuOpenChange={setBillingModeMenuOpen}
              disabled={busy}
              accessTokenPlaceholder="sk-..."
              accessTokenSavedMeta={billingDraft.hasSavedAccessToken && !billingAccessTokenRemovalPending ? t.settings.savedSecretPlaceholder : null}
              accessTokenRemovalPending={billingAccessTokenRemovalPending}
              onAccessTokenRemove={() => {
                const nextBillingDraft = { ...billingDraftRef.current, accessToken: '', hasSavedAccessToken: false };
                billingDraftRef.current = nextBillingDraft;
                setBillingDraft(nextBillingDraft);
                setBillingAccessTokenRemovalPending(true);
                invalidateDraftProofs();
              }}
              userIdError={billingValidation === 'user-id' ? t.settings.billingValidationUserId : null}
              accessTokenError={billingValidation === 'token' ? t.settings.billingValidationAccessToken : null}
            />
            {billing.billing?.balance?.snapshot.details?.length ? (
              <div className="billing-detail-list">
                <div className="billing-detail-title">{t.settings.billingDetails}</div>
                {billing.billing.balance.snapshot.details.map((billingDetail, index) => (
                  <div
                    key={`${billingDetail.kind}:${index}`}
                    className={`billing-detail-item${index > 0 ? ' billing-detail-item-spaced' : ''}`}
                  >
                    {formatBillingDetail(billingDetail)}
                  </div>
                ))}
              </div>
            ) : null}
            {billing.billing?.refreshState === 'error' && (
              <div className="billing-error">
                <StatusNotice tone="warning" message={t.settings.billingErrorStale} detail={billing.error} detailCopyable />
              </div>
            )}
            {formatExactTaskCost(billing.billing?.lastExactTaskCost) && (
              <div className="billing-last-cost">
                {t.main.billingLastCost}: {formatExactTaskCost(billing.billing?.lastExactTaskCost)}
              </div>
            )}
            {!formatExactTaskCost(billing.billing?.lastExactTaskCost) && formatBalanceChange(billing.billing?.lastBalanceChange) && (
              <div className="billing-last-cost">
                {t.main.billingLastChange}: {formatBalanceChange(billing.billing?.lastBalanceChange)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!profileId) {
    return (
      <div className="page page-enter">
        <ProviderSettingsPageHeader title={t.common.provider} onBack={() => onNav('settings')} />
        <div className="scroll">
          <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.noProfileSelected}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-enter settings-page">
      <ProviderSettingsPageHeader
        backButtonTestId="provider-detail-back-button"
        title={(
          <div className="page-header-meta">
            <div className="hdr-title page-header-title">{detail.profile?.displayName ?? t.common.provider}</div>
          </div>
        )}
        onBack={() => onNav('settings')}
        rightSlot={(
          <IconButton
            data-testid="provider-delete-button"
            className="hdr-btn"
            hostClassName="hdr-btn-danger"
            quiet
            icon={<Icon name="trash" />}
            tooltip={t.common.delete}
            disabled={busy || !detail.profile}
            onClick={() => void remove()}
          />
        )}
      />

      <div className="scroll scroll-footer-pad scroll-footer-pad-detail">
        {detail.loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
        {detail.error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{detail.error}</div>}
        {detail.profile && (
          <>
            <ProviderProfileEditor
              connectionTitle={t.settings.connectionInfo}
              aliasValue={displayName}
              onAliasValue={(value) => {
                setDisplayName(value);
                setAliasError(null);
              }}
              aliasError={aliasError}
              apiFormatLabel={apiFormatLabel(detail.profile.apiFormat)}
              apiFormatTone="positive"
              apiFormatDetail={t.settings.apiFormatDetected(apiFormatLabel(detail.profile.apiFormat))}
              pathSettings={(
                <ProviderAdvancedPathSection
                  apiFormat={detail.profile.apiFormat}
                  paths={paths}
                  authModeMenuOpen={authModeMenuOpen}
                  disabled={busy}
                  onAuthModeMenuOpenChange={setAuthModeMenuOpen}
                  onPathChange={updatePath}
                />
              )}
              connection={connection}
              onConnectionChange={updateConnectionDraft}
              endpointErrors={endpointErrors}
              measurementResults={connectionProbeResultById(modelCatalog.measurementResults)}
              resolvedEndpointId={modelCatalog.resolvedEndpointId}
              measurementBusy={modelCatalog.refreshBusy}
              measurementSupported={measurementSupported}
              onMeasure={() => void probeEndpoints()}
              apiKeyValue={apiKey}
              onApiKeyValue={updateApiKey}
              apiKeyPlaceholder="sk-..."
              showKey={showKey}
              onShowKeyChange={setShowKey}
              apiKeySaved={Boolean(detail.profile.secretRefs?.apiKey) && !apiKeyRemovalPending}
              apiKeySavedHint={detail.profile.secretRefs?.apiKey ? t.settings.savedSecretPlaceholder : null}
              apiKeyRemovalPending={apiKeyRemovalPending}
              onApiKeyRemove={() => {
                setApiKey('');
                setApiKeyRemovalPending(true);
                invalidateDraftProofs();
              }}
              disabled={busy}
            />
            <ProviderDefaultModelSection
              disabled={busy}
              loading={modelCatalog.loading}
              discoverySupported={modelDiscoverySupported}
              modelMode={modelMode}
              modelMenuOpen={modelMenuOpen}
              modelOptions={modelOptions}
              defaultModel={defaultModel}
              customPlaceholder={t.settings.customModelId}
              triggerValue={modelTriggerValue}
              listNotice={modelListNotice}
              modelStatusNotice={selectedModelStatus ? {
                tone: selectedModelInfo?.supportStatus === 'custom-unchecked' ? 'warning' : 'info',
                message: selectedModelStatus,
              } : null}
              onRefresh={() => void refreshModels()}
              onModelMenuOpenChange={setModelMenuOpen}
              onModelModeChange={(mode) => {
                modelModeTouchedRef.current = true;
                setModelMode(mode);
                setModelMenuOpen(false);
                invalidateDraftProofs();
              }}
              onDefaultModelSelect={(id) => {
                modelModeTouchedRef.current = true;
                setDefaultModel(id);
                setModelMode('list');
                setModelMenuOpen(false);
                invalidateDraftProofs();
              }}
              onDefaultModelInput={(value) => {
                modelModeTouchedRef.current = true;
                setModelMode('custom');
                setDefaultModel(value);
                invalidateDraftProofs();
              }}
            />
            {renderBillingSection()}
          </>
        )}
      </div>

      <ProviderSettingsFooter
        testBusy={connectionTestBusy}
        saveBusy={busy}
        testSupported={connectionTestSupported}
        saveDisabled={saveDisabled}
        onTest={() => void test()}
        onSave={() => void save()}
      />
    </div>
  );
}

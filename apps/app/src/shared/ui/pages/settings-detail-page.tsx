import { useEffect, useRef, useState } from 'react';
import { PROMPT_OPTIMIZER_PROFILE_ID } from '@imagen-ps/application';
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
import { StatusNotice } from '../components/status-notice';
import { useToast } from '../components/toast-host';
import { UxpTextArea } from '../components/uxp-form-controls';
import { useI18n } from '../i18n/i18n-context';
import { Button, FieldLabel, HelpText, TextField, Checkbox } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import {
  statusFromEndpointMeasurementResult,
  statusFromProviderConnectionTestResult,
} from '../provider-status';
import { TextSelect } from '../components/text-select';
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
    readonly instruction: string;
    readonly apiKey: string;
    readonly apiKeyRemovalPending: boolean;
    readonly billingAccessTokenRemovalPending: boolean;
  },
  isOptimizerProfile: boolean,
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
      isOptimizerProfile ? draft.instruction : undefined,
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
  const [instruction, setInstruction] = useState('');
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
  const isOptimizerProfile = detail.profile?.profileId === PROMPT_OPTIMIZER_PROFILE_ID;
  const billing = useProfileBilling(services, profileId);
  const busy = saveBusy;
  const providerDescriptor = detail.profile ? descriptorForApiFormat(providers, detail.profile.apiFormat) : undefined;
  const capabilities = providerProfileUpsertCapabilities(detail.profile, { isOptimizerProfile });
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
          instruction,
          apiKey,
          apiKeyRemovalPending,
          billingAccessTokenRemovalPending,
        },
        isOptimizerProfile,
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
      void refreshModels();
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
    setInstruction(readProviderConfigString(detail.profile, 'instruction'));
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
          isOptimizerProfile ? instruction : undefined,
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
          isOptimizerProfile ? instruction : undefined,
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
    probeDraft: async (currentResolvedEndpointId) => services.commands.measureProfileEndpoints({
      ...buildDraftCommandInput(),
      currentResolvedEndpointId,
    }),
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

  const refreshModels = async () => {
    try {
      const result = await modelCatalog.refresh();
      if (result.kind === 'probe') {
        const status = statusFromEndpointMeasurementResult(result.value, t);
        show(status.message, status.tone, {
          key: 'settings-detail-endpoint-probe',
          durationMs: status.durationMs,
          dismissible: status.dismissible,
          copyable: status.copyable,
        });
      }
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', {
        key: 'settings-detail-endpoint-probe-error',
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
  const modelSelectDisabled = busy || modelCatalog.loading || modelOptions.length === 0;
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

  const renderPathSettings = () => {
    if (!detail.profile) {
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
        {detail.profile.apiFormat === 'openai-images' ? (
          <>
            <div className="field">
              <FieldLabel htmlFor="provider-generation-path-input">{t.settings.generationPath}</FieldLabel>
              <TextField
                data-testid="provider-generation-path-input"
                id="provider-generation-path-input"
                className="field-input mono ui-field-control"
                value={paths.generation}
                disabled={busy}
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
                disabled={busy}
                onValue={(value) => updatePath({ edit: value })}
              />
            </div>
            <HelpText className="field-hint">{t.settings.authModeFixedBearer}</HelpText>
          </>
        ) : null}
        {detail.profile.apiFormat === 'openai-chat-completions' ? (
          <>
            <div className="field">
              <FieldLabel htmlFor="provider-invoke-path-input">{t.settings.invokePath}</FieldLabel>
              <TextField
                data-testid="provider-invoke-path-input"
                id="provider-invoke-path-input"
                className="field-input mono ui-field-control"
                value={paths.invoke}
                disabled={busy}
                onValue={(value) => updatePath({ invoke: value })}
              />
            </div>
            <HelpText className="field-hint">{t.settings.authModeFixedBearer}</HelpText>
          </>
        ) : null}
        {detail.profile.apiFormat === 'gemini-generate-content' ? (
          <>
            <div className="field">
              <FieldLabel htmlFor="provider-invoke-template-input">{t.settings.invokePathTemplate}</FieldLabel>
              <TextField
                data-testid="provider-invoke-template-input"
                id="provider-invoke-template-input"
                className="field-input mono ui-field-control"
                value={paths.invokeTemplate}
                disabled={busy}
                onValue={(value) => updatePath({ invokeTemplate: value })}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="provider-auth-mode-selector">{t.settings.authMode}</FieldLabel>
              <TextSelect
                label={t.settings.authMode}
                value={authOptions.find((option) => option.id === paths.authMode)?.label ?? paths.authMode}
                disabled={busy}
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

  const renderDefaultModelSection = () => (
    <div className="section">
      <div className="settings-section-header">
        <div className="section-title settings-section-heading">{t.settings.defaultModel}</div>
        <IconButton
          data-testid="provider-refresh-models-button"
          className="settings-icon-button"
          compactSquare
          disabled={modelCatalog.loading || busy || !modelDiscoverySupported}
          icon={<Icon name="refresh" size={16} className={modelCatalog.loading ? 'spin' : undefined} />}
          tooltip={!modelDiscoverySupported ? t.settings.modelDiscoveryUnsupported : modelCatalog.loading ? t.settings.refreshingModels : t.settings.refreshModels}
          aria-label={!modelDiscoverySupported ? t.settings.modelDiscoveryUnsupported : modelCatalog.loading ? t.settings.refreshingModels : t.settings.refreshModels}
          onClick={() => void refreshModels()}
        />
      </div>
      <div className="field">
        {modelMode === 'list' && modelOptions.length > 0 ? (
          <TextSelect
            label={t.settings.defaultModel}
            value={modelTriggerValue}
            disabled={modelSelectDisabled}
            open={modelMenuOpen}
            onOpenChange={setModelMenuOpen}
            options={modelOptions}
            selectedId={defaultModel}
            onSelect={(id) => {
              modelModeTouchedRef.current = true;
              setDefaultModel(id);
              setModelMode('list');
              setModelMenuOpen(false);
              invalidateDraftProofs();
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
            placeholder={t.settings.customModelId}
            value={defaultModel}
            disabled={busy}
            onValue={(value) => {
              modelModeTouchedRef.current = true;
              setModelMode('custom');
              setDefaultModel(value);
              invalidateDraftProofs();
            }}
          />
        )}
        <div className="provider-model-mode-row">
          <Checkbox
            data-testid="provider-use-custom-model-checkbox"
            checked={modelMode === 'custom'}
            disabled={busy}
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
      </div>
      {modelListNotice && (
        <div data-testid="provider-model-list-notice">
          <StatusNotice
            tone={modelListNotice.tone}
            message={modelListNotice.message}
            detail={'detail' in modelListNotice ? modelListNotice.detail : null}
            detailCopyable={'detailCopyable' in modelListNotice ? modelListNotice.detailCopyable : false}
          />
        </div>
      )}
      {selectedModelStatus && (
        <div data-testid="provider-model-status-notice">
          <StatusNotice
            tone={selectedModelInfo?.supportStatus === 'custom-unchecked' ? 'warning' : 'info'}
            message={selectedModelStatus}
          />
        </div>
      )}
    </div>
  );

  const renderBillingSection = () => {
    if (isOptimizerProfile) {
      return null;
    }
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

  const renderPromptBehaviorSection = () => {
    if (!isOptimizerProfile) {
      return null;
    }
    return (
      <div className="section">
        <div className="section-title settings-section-heading">{t.settings.promptBehavior}</div>
        <div className="field field-textarea">
          <FieldLabel htmlFor="provider-instruction-input">{t.settings.instruction}</FieldLabel>
          <UxpTextArea
            data-testid="provider-instruction-input"
            id="provider-instruction-input"
            className="field-input field-textarea-input mono"
            rows={5}
            value={instruction}
            onValue={(value) => {
              setInstruction(value);
              invalidateDraftProofs();
            }}
            disabled={busy}
            placeholder={t.settings.instructionPlaceholder}
          />
        </div>
      </div>
    );
  };

  if (!profileId) {
    return (
      <div className="page page-enter">
        <header className="hdr">
          <IconButton
            className="hdr-btn"
            quiet
            icon={<Icon name="chevron-left" />}
            tooltip={t.common.back}
            onClick={() => onNav('settings')}
          />
          <div className="hdr-title">{t.common.provider}</div>
          <div style={{ width: 32 }} />
        </header>
        <div className="scroll">
          <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.noProfileSelected}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-enter settings-page">
      <header className="hdr">
        <IconButton
          data-testid="provider-detail-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => onNav('settings')}
        />
        <div className="page-header-meta">
          <div className="hdr-title page-header-title">{detail.profile?.displayName ?? t.common.provider}</div>
        </div>
        {!isOptimizerProfile && (
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
      </header>

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
              pathSettings={renderPathSettings()}
              connection={connection}
              onConnectionChange={updateConnectionDraft}
              endpointErrors={endpointErrors}
              measurementResults={connectionProbeResultById(modelCatalog.measurementResults)}
              resolvedEndpointId={modelCatalog.resolvedEndpointId}
              measurementBusy={modelCatalog.refreshBusy}
              measurementSupported={measurementSupported}
              onMeasure={() => void refreshModels()}
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
            {renderDefaultModelSection()}
            {renderPromptBehaviorSection()}
            {renderBillingSection()}
          </>
        )}
      </div>

      <footer className="det-footer">
        <div className="settings-detail-footer-inner">
          <div className="settings-detail-footer-actions">
            <IconButton
              data-testid="provider-test-button"
              className="settings-icon-button"
              compactSquare
              disabled={busy || connectionTestBusy || !connectionTestSupported}
              icon={connectionTestBusy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="network" size={16} />}
              tooltip={!connectionTestSupported ? t.settings.providerConnectionUnsupported : connectionTestBusy ? t.settings.testingConnection : t.settings.testConnection}
              aria-label={!connectionTestSupported ? t.settings.providerConnectionUnsupported : connectionTestBusy ? t.settings.testingConnection : t.settings.testConnection}
              onClick={() => void test()}
            />
          </div>
          <Button
            data-testid="provider-save-button"
            className="btn-save"
            variant="accent"
            disabled={saveDisabled}
            onClick={() => void save()}
          >
            {busy ? t.settings.saving : t.common.save}
          </Button>
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EndpointProbeResult, ProviderModelInfo, ProviderProfile, ProviderProfileConfig, ProviderProfileConfigValue } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import {
  billingFieldError,
  billingModeOptions,
  connectionProbeResultById,
  formatBillingDetail,
  normalizeProviderConnectionDraft,
  providerConfigFromForm,
  readProviderBillingDraft,
  readProviderConfigString,
  readProviderConnectionDraft,
  sanitizeProviderDisplayName,
  sanitizeProviderSecretValue,
  useProfileDetail,
  useProfileModels,
  type ProviderBillingDraft,
  type ProviderConnectionDraft,
} from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { useNotice } from '../components/notice';
import { ProviderBillingSettings } from '../components/provider-billing-settings';
import { ProviderProfileEditor } from '../components/provider-profile-editor';
import { StatusNotice } from '../components/status-notice';
import { UxpTextArea } from '../components/uxp-form-controls';
import { useI18n } from '../i18n/i18n-context';
import { Button, FieldLabel, TextField, Checkbox } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { statusFromEndpointProbeResult } from '../provider-status';
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

function formatElapsedMs(startedAt: number): string {
  return `${Math.max(1, Math.round(performance.now() - startedAt))} ms`;
}

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
    providerId: profile?.providerId ?? null,
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
  return {
    ...profile.config,
    ...nextConfig,
  } as Record<string, ProviderProfileConfigValue>;
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
  const family = String(profile.config.family ?? profile.providerId);
  const nextDisplayName = sanitizeProviderDisplayName(draft.displayName) || profile.displayName;
  const nextConfig = mergeProfileConfigForSave(
    profile,
    providerConfigFromForm(
      profile.providerId,
      nextDisplayName,
      family,
      draft.connection,
      draft.defaultModel,
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
  const detail = useProfileDetail(services, profileId);
  const models = useProfileModels(services, profileId);
  const [displayName, setDisplayName] = useState('');
  const [connection, setConnection] = useState<ProviderConnectionDraft>(readProviderConnectionDraft(null));
  const [defaultModel, setDefaultModel] = useState('');
  const [billingDraft, setBillingDraft] = useState<ProviderBillingDraft>(readProviderBillingDraft(null));
  const [billingModeMenuOpen, setBillingModeMenuOpen] = useState(false);
  const [billingExpanded, setBillingExpanded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyRemovalPending, setApiKeyRemovalPending] = useState(false);
  const [billingAccessTokenRemovalPending, setBillingAccessTokenRemovalPending] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [modelsStale, setModelsStale] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testMeta, setTestMeta] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<{ readonly tone: 'neutral' | 'positive' | 'negative'; readonly message: string }>({ tone: 'neutral', message: t.settings.testNotTested });
  const [busy, setBusy] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMode, setModelMode] = useState<'list' | 'custom'>('list');
  const [probeResults, setProbeResults] = useState<readonly EndpointProbeResult[]>([]);
  const [suggestedEndpointId, setSuggestedEndpointId] = useState<string | undefined>();
  const lastLoadedProfileIdRef = useRef<string | null>(null);
  const modelModeTouchedRef = useRef(false);
  const connectionRef = useRef(connection);
  const billingDraftRef = useRef(billingDraft);
  const draftRevisionRef = useRef(0);
  const busyRef = useRef(false);
  const saveNotice = useNotice({ defaultDurationMs: null });
  const isOptimizerProfile = detail.profile?.providerId === 'prompt-optimize';
  const billing = useProfileBilling(services, profileId);

  const invalidateDraftProofs = () => {
    draftRevisionRef.current += 1;
    setTestStatus({ tone: 'neutral', message: t.settings.changesNotTested });
    setTestMeta(null);
    if (models.models.length > 0) {
      setModelsStale(true);
    }
    setProbeResults([]);
    setSuggestedEndpointId(undefined);
  };

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
    const nextConnection = normalizeProviderConnectionDraft(updater(connectionRef.current));
    connectionRef.current = nextConnection;
    setConnection(nextConnection);
    invalidateDraftProofs();
  };

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    draftRevisionRef.current += 1;
    setDisplayName(detail.profile.displayName);
    const nextConnection = readProviderConnectionDraft(detail.profile);
    connectionRef.current = nextConnection;
    setConnection(nextConnection);
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
    setModelsStale(false);
    setModelMenuOpen(false);
    setProbeResults([]);
    setSuggestedEndpointId(undefined);
    setTestStatus({ tone: 'neutral', message: t.settings.testNotTested });
    setTestMeta(null);
 }, [detail.profile]);

  useEffect(() => {
    const nextProfileId = detail.profile?.profileId ?? null;
    if (lastLoadedProfileIdRef.current === nextProfileId) {
      return;
    }
    lastLoadedProfileIdRef.current = nextProfileId;
    saveNotice.clear();
    setTestMeta(null);
    setTestStatus({ tone: 'neutral', message: t.settings.testNotTested });
  }, [detail.profile?.profileId]);

  useEffect(() => {
    modelModeTouchedRef.current = false;
  }, [detail.profile?.profileId]);

  const persistProfile = async (): Promise<ProviderProfile | null> => {
    if (!detail.profile) {
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.persist.no_profile', { profileId });
      return null;
    }
    const family = String(detail.profile.config.family ?? detail.profile.providerId);
    await services.diagnostics?.checkpoint(
      'uxp.ui.settings_detail.persist.input_prepared',
      profileFormCheckpointAttrs(detail.profile, { apiKey, defaultModel, billingAccessToken: billingDraft.accessToken }),
      {
        profile_id: detail.profile.profileId,
        provider_id: detail.profile.providerId,
      },
    );
    const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
    const removedSecretNames = [
      ...(apiKeyRemovalPending ? ['apiKey'] : []),
      ...(billingAccessTokenRemovalPending ? ['billingAccessToken'] : []),
    ];
    return detail.save({
      profileId: detail.profile.profileId,
      providerId: detail.profile.providerId,
      displayName: sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
      enabled: detail.profile.enabled,
      config: mergeProfileConfigForSave(
        detail.profile,
        providerConfigFromForm(
          detail.profile.providerId,
          sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
          family,
          connection,
          defaultModel,
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

  const probeCurrentDraft = async () => {
    if (!detail.profile) {
      throw new Error('No provider profile selected.');
    }
    const family = String(detail.profile.config.family ?? detail.profile.providerId);
    const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
    const removedSecretNames = [
      ...(apiKeyRemovalPending ? ['apiKey'] : []),
      ...(billingAccessTokenRemovalPending ? ['billingAccessToken'] : []),
    ];
    return services.commands.probeProfileEndpoints({
      profileId: detail.profile.profileId,
      providerId: detail.profile.providerId,
      displayName: sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
      config: mergeProfileConfigForSave(
        detail.profile,
        providerConfigFromForm(
          detail.profile.providerId,
          sanitizeProviderDisplayName(displayName) || detail.profile.displayName,
          family,
          connection,
          defaultModel,
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

  const save = async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.entered', { profileId });
    setBusy(true);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.busy_set', { busy: true, profileId });
    saveNotice.clear();
    setAliasError(null);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.status_cleared', { profileId });
    try {
      const providerDescriptor = detail.profile ? services.commands.describeProvider(detail.profile.providerId) : undefined;
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
        providerId: profile?.providerId ?? null,
        hasProfile: profile !== null,
      }, {
        ...(profile ? { profile_id: profile.profileId, provider_id: profile.providerId } : {}),
      });
      if (profile) {
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_success_feedback', {
          profileId: profile.profileId,
          providerId: profile.providerId,
        }, {
          profile_id: profile.profileId,
          provider_id: profile.providerId,
        });
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_success_feedback', {
          profileId: profile.profileId,
          providerId: profile.providerId,
        }, {
          profile_id: profile.profileId,
          provider_id: profile.providerId,
        });
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_profiles_changed', {
          profileId: profile.profileId,
          providerId: profile.providerId,
        }, {
          profile_id: profile.profileId,
          provider_id: profile.providerId,
        });
        await onProfilesChanged(profile.profileId);
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_profiles_changed', {
          profileId: profile.profileId,
          providerId: profile.providerId,
        }, {
          profile_id: profile.profileId,
          provider_id: profile.providerId,
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
      saveNotice.show(message, 'negative', { durationMs: null, copyable: true });
    } finally {
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_busy_clear', { profileId });
      busyRef.current = false;
      setBusy(false);
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_busy_clear', { profileId });
    }
  };

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    void services.diagnostics?.checkpoint('uxp.ui.settings_detail.render.ready', {
      profileId: detail.profile.profileId,
      providerId: detail.profile.providerId,
      busy,
        hasStatus: saveNotice.notice !== null || testStatus.message !== t.settings.testNotTested,
      }, {
        profile_id: detail.profile.profileId,
        provider_id: detail.profile.providerId,
      });
  }, [busy, detail.profile, saveNotice.notice, testStatus, t.settings.testNotTested, services.diagnostics]);

  const test = async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    const startedAt = performance.now();
    const revision = draftRevisionRef.current;
    setBusy(true);
    setTestStatus({ tone: 'neutral', message: t.settings.testingConnection });
    setTestMeta(null);
    try {
      const result = await probeCurrentDraft();
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      if (draftRevisionRef.current === revision) {
        setProbeResults(result.value.results);
        setSuggestedEndpointId(result.value.suggestedEndpointId);
        if (result.value.models) {
          models.replace(result.value.models);
          setModelsStale(false);
        }
        const status = statusFromEndpointProbeResult(result.value, t);
        setTestStatus({ tone: status.tone === 'positive' || status.tone === 'negative' ? status.tone : 'neutral', message: status.message });
        setTestMeta(`${formatElapsedMs(startedAt)}`);
      }
    } catch (error) {
      if (draftRevisionRef.current === revision) {
        const detail = error instanceof Error ? error.message : String(error);
        setTestStatus({ tone: 'negative', message: `${t.settings.connectionFailed}: ${detail}` });
        setTestMeta(`${formatElapsedMs(startedAt)}`);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const refreshModels = async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    const revision = draftRevisionRef.current;
    setTestStatus({ tone: 'neutral', message: t.settings.testNotTested });
    setTestMeta(null);
    try {
      if (detail.profile && hasDraftChanges(
        detail.profile,
        {
          displayName,
          connection,
          defaultModel,
          billing: billingDraft,
          instruction,
          apiKey,
          apiKeyRemovalPending,
          billingAccessTokenRemovalPending,
        },
        isOptimizerProfile,
      )) {
        const result = await probeCurrentDraft();
        if (!result.ok) {
          throw new Error(`${result.error.category}: ${result.error.message}`);
        }
        if (draftRevisionRef.current === revision) {
          setProbeResults(result.value.results);
          setSuggestedEndpointId(result.value.suggestedEndpointId);
          const refreshed = result.value.models ?? [];
          models.replace(refreshed);
          setModelsStale(false);
        }
        return;
      }
      await models.refresh();
      setModelsStale(false);
    } catch {
      // errors flow into models.error and are rendered by modelListNotice
    } finally {
      busyRef.current = false;
    }
  };

  const modelOptions = useMemo(
    () => models.models.map((model) => ({
      id: model.id,
      label: model.displayName ?? model.id,
    })),
    [models.models],
  );

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    const currentModel = readProviderConfigString(detail.profile, 'defaultModel').trim();
    const hasOptions = modelOptions.length > 0;
    const hasMatch = modelOptions.some((option) => option.id === currentModel);
    if (!modelModeTouchedRef.current) {
      setModelMode(hasOptions && (currentModel.length === 0 || hasMatch) ? 'list' : 'custom');
      setModelMenuOpen(false);
    }
  }, [detail.profile, modelOptions]);

  const remove = async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    saveNotice.clear();
    try {
      await detail.remove();
      await onProfilesChanged(null);
      onNav('settings');
    } catch (error) {
      saveNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const modelSelectionLabel = modelOptions.find((option) => option.id === defaultModel)?.label ?? defaultModel.trim();
  const modelTriggerValue = modelSelectionLabel || t.settings.chooseFromList;
  const modelSelectDisabled = busy || models.loading || modelOptions.length === 0;
  const selectedModelInfo = models.models.find((model) => model.id === defaultModel);
  const selectedModelStatus = modelStatusMessage(selectedModelInfo, t);
  const providerDescriptor = detail.profile ? services.commands.describeProvider(detail.profile.providerId) : undefined;
  const endpointErrors = duplicateEndpointErrors(connection, t.settings.duplicateEndpointUrl);
  const effectiveBillingDraft = billingDraftForSave(billingDraft, billingAccessTokenRemovalPending);
  const billingValidation = billingFieldError(effectiveBillingDraft, providerDescriptor);
  const draftDirty = detail.profile
    ? hasDraftChanges(
        detail.profile,
        {
          displayName,
          connection,
          defaultModel,
          billing: billingDraft,
          instruction,
          apiKey,
          apiKeyRemovalPending,
          billingAccessTokenRemovalPending,
        },
        isOptimizerProfile,
      )
    : false;
  const saveDisabled = busy || !detail.profile || endpointErrors.size > 0 || Boolean(aliasError);
  const modelListNotice = models.error
    ? {
        tone: 'warning' as const,
        message: t.settings.modelListFailed,
        detail: models.error,
        detailCopyable: true,
      }
    : modelsStale
      ? { tone: 'warning' as const, message: t.settings.modelListStale }
    : modelOptions.length === 0
      ? { tone: 'info' as const, message: t.settings.modelListEmpty }
      : null;

  const renderTestStatus = () => {
    if (testStatus.tone === 'negative') {
      return (
        <StatusNotice
          tone="negative"
          message={testStatus.message}
          detail={testMeta}
          detailCopyable
        />
      );
    }
    if (testStatus.message === t.settings.testNotTested && !testMeta) {
      return <span className="test-status test-status-neutral">{testStatus.message}</span>;
    }
    return (
      <span className={`test-status test-status-${testStatus.tone}`}>
        {testStatus.message}
        {testMeta ? ` · ${testMeta}` : null}
      </span>
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
          disabled={models.loading || busy}
          icon={<Icon name="refresh" size={16} className={models.loading ? 'spin' : undefined} />}
          tooltip={models.loading ? t.settings.refreshingModels : t.settings.refreshModels}
          aria-label={models.loading ? t.settings.refreshingModels : t.settings.refreshModels}
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
          <div className="hdr-title">Provider</div>
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
          <div className="hdr-title page-header-title">{detail.profile?.displayName ?? 'Provider'}</div>
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
              connection={connection}
              onConnectionChange={updateConnectionDraft}
              endpointErrors={endpointErrors}
              probeResults={connectionProbeResultById(probeResults)}
              suggestedEndpointId={suggestedEndpointId}
              apiKeyValue={apiKey}
              onApiKeyValue={updateApiKey}
              apiKeyPlaceholder="sk-..."
              showKey={showKey}
              onShowKeyChange={setShowKey}
              connectionStatus={saveNotice.notice}
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
              disabled={busy}
              icon={busy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="network" size={16} />}
              tooltip={busy ? t.settings.testingConnection : t.settings.testConnection}
              aria-label={busy ? t.settings.testingConnection : t.settings.testConnection}
              onClick={() => void test()}
            />
            {renderTestStatus()}
          </div>
          {saveNotice.notice?.tone === 'negative' ? (
            <Button data-testid="provider-save-button" className="btn-save" variant="accent" disabled={busy} onClick={() => void save()}>{t.settings.retrySave}</Button>
          ) : busy ? (
            <span className="save-status save-status-busy">{t.settings.saving}</span>
          ) : draftDirty ? (
            <Button data-testid="provider-save-button" className="btn-save" variant="accent" disabled={saveDisabled} onClick={() => void save()}>{t.settings.saveChanges}</Button>
          ) : (
            <span className="save-status save-status-saved">
              <Icon name="check" size={14} />
              {t.settings.saved}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

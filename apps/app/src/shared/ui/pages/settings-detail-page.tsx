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
import { Button, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
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
  const [instruction, setInstruction] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyRemovalPending, setApiKeyRemovalPending] = useState(false);
  const [billingAccessTokenRemovalPending, setBillingAccessTokenRemovalPending] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [modelsStale, setModelsStale] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testMeta, setTestMeta] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMode, setModelMode] = useState<'list' | 'custom'>('list');
  const [probeResults, setProbeResults] = useState<readonly EndpointProbeResult[]>([]);
  const [suggestedEndpointId, setSuggestedEndpointId] = useState<string | undefined>();
  const lastLoadedProfileIdRef = useRef<string | null>(null);
  const modelModeTouchedRef = useRef(false);
  const saveNotice = useNotice({ defaultDurationMs: null });
  const testNotice = useNotice({ defaultDurationMs: null });
  const isOptimizerProfile = detail.profile?.providerId === 'prompt-optimize';
  const billing = useProfileBilling(services, profileId);

  const invalidateDraftProofs = () => {
    if (probeResults.length > 0 || testNotice.notice) {
      testNotice.show(t.settings.changesNotTested, 'warning', { durationMs: null, copyable: false });
    }
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

  const updateBillingDraft = (next: ProviderBillingDraft) => {
    setBillingDraft(next);
    if (next.accessToken.trim().length > 0) {
      setBillingAccessTokenRemovalPending(false);
    }
    invalidateDraftProofs();
  };

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    setDisplayName(detail.profile.displayName);
    setConnection(readProviderConnectionDraft(detail.profile));
    setDefaultModel(readProviderConfigString(detail.profile, 'defaultModel'));
    setBillingDraft(readProviderBillingDraft(detail.profile));
    setBillingModeMenuOpen(false);
    setInstruction(readProviderConfigString(detail.profile, 'instruction'));
    setApiKey('');
    setApiKeyRemovalPending(false);
    setBillingAccessTokenRemovalPending(false);
    setAliasError(null);
    setModelsStale(false);
    setModelMenuOpen(false);
    setProbeResults([]);
    setSuggestedEndpointId(undefined);
  }, [detail.profile]);

  useEffect(() => {
    const nextProfileId = detail.profile?.profileId ?? null;
    if (lastLoadedProfileIdRef.current === nextProfileId) {
      return;
    }
    lastLoadedProfileIdRef.current = nextProfileId;
    saveNotice.clear();
    testNotice.clear();
    setTestMeta(null);
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
        hasStatus: saveNotice.notice !== null || testNotice.notice !== null,
      }, {
        profile_id: detail.profile.profileId,
        provider_id: detail.profile.providerId,
      });
  }, [busy, detail.profile, saveNotice.notice, testNotice.notice, services.diagnostics]);

  const test = async () => {
    const startedAt = performance.now();
    setBusy(true);
    testNotice.clear();
    setTestMeta(null);
    try {
      const result = await probeCurrentDraft();
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      setProbeResults(result.value.results);
      setSuggestedEndpointId(result.value.suggestedEndpointId);
      if (result.value.models) {
        models.replace(result.value.models);
        setModelsStale(false);
      }
      const status = statusFromEndpointProbeResult(result.value, t);
      testNotice.show(status.message, status.tone, status);
      setTestMeta(`${t.settings.testResultPrefix} · ${formatElapsedMs(startedAt)}`);
    } catch (error) {
      testNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
      setTestMeta(`${t.settings.testResultPrefix} · ${formatElapsedMs(startedAt)}`);
    } finally {
      setBusy(false);
    }
  };

  const refreshModels = async () => {
    testNotice.clear();
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
        setProbeResults(result.value.results);
        setSuggestedEndpointId(result.value.suggestedEndpointId);
        const refreshed = result.value.models ?? [];
        models.replace(refreshed);
        setModelsStale(false);
        if (refreshed.length === 0) {
          testNotice.show(t.settings.configValidProviderNoModels, 'warning', { durationMs: null, copyable: false });
        }
        return;
      }
      const refreshed = await models.refresh();
      setModelsStale(false);
      if (refreshed.length === 0) {
        testNotice.show(t.settings.configValidProviderNoModels, 'warning', { durationMs: null, copyable: false });
      }
    } catch (error) {
      testNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
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
    setBusy(true);
    saveNotice.clear();
    try {
      await detail.remove();
      await onProfilesChanged(null);
      onNav('settings');
    } catch (error) {
      saveNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
    } finally {
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
  const saveLabel = busy ? t.settings.saving : draftDirty ? t.settings.saveChanges : t.settings.savedButton;
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
        <IconButton
          data-testid="provider-detail-refresh-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="refresh" />}
          tooltip={t.common.refresh}
          onClick={() => void detail.reload()}
        />
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
              onConnectionChange={(next) => {
                setConnection(normalizeProviderConnectionDraft(next));
                invalidateDraftProofs();
              }}
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
              onApiKeyReplace={() => setApiKeyRemovalPending(false)}
              onApiKeyRemove={() => {
                setApiKey('');
                setApiKeyRemovalPending(true);
                invalidateDraftProofs();
              }}
              extraSections={(
                <>
                  {!isOptimizerProfile && (
                    <div className="section">
                      <div className="section-title settings-section-heading">{t.settings.billing}</div>
                      <div className="billing-summary-card">
                        <div className="billing-summary-header">
                          <div className="billing-summary-header-body">
                            <div className="billing-summary-kicker">{t.settings.billingBalanceLabel}</div>
                            <div className="billing-summary-value">
                              {formatBillingPrimary(billing.billing) ?? t.settings.billingDisabled}
                            </div>
                          </div>
                          <div className="billing-summary-actions">
                            <Button
                              data-testid="provider-billing-refresh-button"
                              className="settings-action-compact"
                              variant="secondary"
                              disabled={billing.loading || busy}
                              onClick={() => void billing.refresh()}
                            >
                              {billing.loading ? t.settings.billingRefreshing : t.settings.billingRefresh}
                            </Button>
                          </div>
                        </div>
                        <div className="billing-summary-meta-list">
                          {billing.billing?.balance?.checkedAt && (
                            <div className="billing-summary-meta-item">
                              {t.settings.billingCheckedAt}: {new Date(billing.billing.balance.checkedAt).toLocaleString()}
                            </div>
                          )}
                          {billing.billing?.refreshState === 'refreshing' ? (
                            <div className={`billing-summary-meta-item${billing.billing?.balance?.checkedAt ? ' billing-summary-meta-item-spaced' : ''}`}>
                              {t.settings.billingRefreshing}
                            </div>
                          ) : null}
                        </div>
                        {billing.billing?.balance?.snapshot.details?.length ? (
                          <div className="billing-detail-list">
                            <div className="billing-detail-title">{t.settings.billingDetails}</div>
                            {billing.billing.balance.snapshot.details.map((detail, index) => (
                              <div
                                key={`${detail.kind}:${index}`}
                                className={`billing-detail-item${index > 0 ? ' billing-detail-item-spaced' : ''}`}
                              >
                                {formatBillingDetail(detail)}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="billing-section">
                        <ProviderBillingSettings
                          billing={effectiveBillingDraft}
                          onBillingChange={updateBillingDraft}
                          billingModeOptions={billingModeOptions(providerDescriptor)}
                          modeMenuOpen={billingModeMenuOpen}
                          onModeMenuOpenChange={setBillingModeMenuOpen}
                          disabled={busy}
                          accessTokenPlaceholder="sk-..."
                          accessTokenSavedMeta={billingDraft.hasSavedAccessToken && !billingAccessTokenRemovalPending ? t.settings.savedSecretPlaceholder : null}
                          accessTokenSavedHint={billingDraft.hasSavedAccessToken && !billingAccessTokenRemovalPending ? t.settings.billingAccessTokenSavedHint : null}
                          accessTokenRemovalPending={billingAccessTokenRemovalPending}
                          onAccessTokenReplace={() => setBillingAccessTokenRemovalPending(false)}
                          onAccessTokenRemove={() => {
                            setBillingDraft({ ...billingDraft, accessToken: '', hasSavedAccessToken: false });
                            setBillingAccessTokenRemovalPending(true);
                            invalidateDraftProofs();
                          }}
                          userIdError={billingValidation === 'user-id' ? t.settings.billingValidationUserId : null}
                          accessTokenError={billingValidation === 'token' ? t.settings.billingValidationAccessToken : null}
                        />
                      </div>
                      {billing.billing?.refreshState === 'error' && (
                        <div style={{ marginTop: 10 }}>
                          <StatusNotice tone="warning" message={t.settings.billingErrorStale} detail={billing.error} detailCopyable />
                        </div>
                      )}
                      {formatExactTaskCost(billing.billing?.lastExactTaskCost) && (
                        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--app-color-text-muted)' }}>
                          {t.main.billingLastCost}: {formatExactTaskCost(billing.billing?.lastExactTaskCost)}
                        </div>
                      )}
                      {!formatExactTaskCost(billing.billing?.lastExactTaskCost) && formatBalanceChange(billing.billing?.lastBalanceChange) && (
                        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--app-color-text-muted)' }}>
                          {t.main.billingLastChange}: {formatBalanceChange(billing.billing?.lastBalanceChange)}
                        </div>
                      )}
                    </div>
                  )}
                  {isOptimizerProfile ? (
                    <div className="section">
                      <div className="section-title">{t.settings.promptBehavior}</div>
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
                          placeholder={t.settings.instructionPlaceholder}
                        />
                      </div>
                    </div>
                  ) : null}
                </>
              )}
              defaultModelSection={(
                <>
                  <div className="field">
                    <div className="settings-inline-heading-row">
                      <div className="settings-inline-heading-copy">
                        <HelpText className="field-hint">
                          {modelMode === 'list' ? t.settings.customModelHint : t.settings.chooseFromListHint}
                        </HelpText>
                      </div>
                      <div className="settings-inline-heading-actions">
                        <Button data-testid="provider-refresh-models-button" className="settings-action-compact" variant="secondary" disabled={models.loading || busy} onClick={() => void refreshModels()}>
                          {models.loading ? t.settings.refreshingModels : t.settings.refreshModels}
                        </Button>
                      </div>
                    </div>
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
                        onValue={(value) => {
                          modelModeTouchedRef.current = true;
                          setModelMode('custom');
                          setDefaultModel(value);
                        }}
                      />
                    )}
                    {modelOptions.length > 0 && (
                      <div className="provider-model-mode-row">
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
                </>
              )}
              testBusy={busy}
              onTest={() => void test()}
              testMeta={testMeta}
              testStatus={testNotice.notice}
            />
          </>
        )}
      </div>

      <footer className="det-footer">
        <div className="settings-detail-footer-inner">
          <Button data-testid="provider-save-button" className="btn-save ui-button-block" variant="accent" disabled={saveDisabled} onClick={() => void save()}>{saveLabel}</Button>
        </div>
      </footer>
    </div>
  );
}

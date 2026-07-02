import { useEffect, useMemo, useRef, useState } from 'react';
import type { EndpointProbeResult, ProviderProfile, ProviderProfileConfig, ProviderProfileConfigValue } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import {
  connectionProbeResultById,
  normalizeProviderConnectionDraft,
  providerConfigFromForm,
  readProviderConfigString,
  readProviderConnectionDraft,
  useProfileDetail,
  useProfileModels,
  type ProviderConnectionDraft,
} from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { useNotice } from '../components/notice';
import { ProviderProfileEditor } from '../components/provider-profile-editor';
import { StatusNotice } from '../components/status-notice';
import { UxpTextArea } from '../components/uxp-form-controls';
import { useI18n } from '../i18n/i18n-context';
import { Button, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { statusFromEndpointProbeResult } from '../provider-status';
import { TextSelect } from '../components/text-select';

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
  },
): Record<string, unknown> {
  return {
    profileId: profile?.profileId ?? null,
    providerId: profile?.providerId ?? null,
    configKeyCount: profile ? Object.keys(profile.config).length : 0,
    hasDirtyCredential: form.apiKey.trim().length > 0,
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
  return stableSerialize(config);
}

function hasDraftChanges(
  profile: ProviderProfile,
  draft: {
    readonly displayName: string;
    readonly connection: ProviderConnectionDraft;
    readonly defaultModel: string;
    readonly instruction: string;
    readonly apiKey: string;
  },
  isOptimizerProfile: boolean,
): boolean {
  if (draft.apiKey.trim().length > 0) {
    return true;
  }
  const family = String(profile.config.family ?? profile.providerId);
  const nextDisplayName = draft.displayName.trim() || profile.displayName;
  const nextConfig = mergeProfileConfigForSave(
    profile,
    providerConfigFromForm(
      profile.providerId,
      nextDisplayName,
      family,
      draft.connection,
      draft.defaultModel,
      isOptimizerProfile ? draft.instruction : undefined,
    ),
  );
  return (
    nextDisplayName !== profile.displayName ||
    normalizeConfigForDraftCompare(nextConfig) !== normalizeConfigForDraftCompare(profile.config)
  );
}

export function SettingsDetailPage({ onNav, profileId, onProfilesChanged, onSaved }: SettingsDetailPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const detail = useProfileDetail(services, profileId);
  const models = useProfileModels(services, profileId);
  const [displayName, setDisplayName] = useState('');
  const [connection, setConnection] = useState<ProviderConnectionDraft>(readProviderConnectionDraft(null));
  const [defaultModel, setDefaultModel] = useState('');
  const [instruction, setInstruction] = useState('');
  const [apiKey, setApiKey] = useState('');
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

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    setDisplayName(detail.profile.displayName);
    setConnection(readProviderConnectionDraft(detail.profile));
    setDefaultModel(readProviderConfigString(detail.profile, 'defaultModel'));
    setInstruction(readProviderConfigString(detail.profile, 'instruction'));
    setApiKey('');
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
      profileFormCheckpointAttrs(detail.profile, { apiKey, defaultModel }),
      {
        profile_id: detail.profile.profileId,
        provider_id: detail.profile.providerId,
      },
    );
    return detail.save({
      profileId: detail.profile.profileId,
      providerId: detail.profile.providerId,
      displayName: displayName.trim() || detail.profile.displayName,
      enabled: detail.profile.enabled,
      config: mergeProfileConfigForSave(
        detail.profile,
        providerConfigFromForm(
          detail.profile.providerId,
          displayName.trim() || detail.profile.displayName,
          family,
          connection,
          defaultModel,
          isOptimizerProfile ? instruction : undefined,
        ),
      ),
      ...(apiKey.trim() ? { secretValues: { apiKey: apiKey.trim() } } : {}),
    });
  };

  const save = async () => {
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.entered', { profileId });
    setBusy(true);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.busy_set', { busy: true, profileId });
    saveNotice.clear();
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.status_cleared', { profileId });
    try {
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
      saveNotice.show(error instanceof Error ? error.message : String(error), 'negative', { durationMs: null, copyable: true });
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
      if (isOptimizerProfile && detail.profile) {
        const savedProfile = await persistProfile();
        if (savedProfile) {
          await onProfilesChanged(savedProfile.profileId);
        }
        if (!savedProfile) {
          throw new Error('No provider profile selected.');
        }
        const result = await services.commands.validatePromptOptimizerProfile(savedProfile.profileId);
        if (result.ok) {
          testNotice.show(t.settings.testSuccess, 'positive', { durationMs: 2200, dismissible: false, copyable: false });
          setTestMeta(`${t.settings.testResultPrefix} · ${formatElapsedMs(startedAt)}`);
          await detail.reload();
          await onProfilesChanged(savedProfile.profileId);
        } else {
          testNotice.show(
            result.error.category === 'validation'
              ? result.error.message
              : `${result.error.category}: ${result.error.message}`,
            'negative',
            { durationMs: null, copyable: true },
          );
          setTestMeta(`${t.settings.testResultPrefix} · ${formatElapsedMs(startedAt)}`);
        }
        return;
      }
      if (!detail.profile) {
        throw new Error('No provider profile selected.');
      }
      const family = String(detail.profile.config.family ?? detail.profile.providerId);
      const result = await services.commands.probeProfileEndpoints({
        profileId: detail.profile.profileId,
        providerId: detail.profile.providerId,
        displayName: displayName.trim() || detail.profile.displayName,
        config: mergeProfileConfigForSave(
          detail.profile,
          providerConfigFromForm(
            detail.profile.providerId,
            displayName.trim() || detail.profile.displayName,
            family,
            connection,
            defaultModel,
            undefined,
          ),
        ),
        ...(apiKey.trim() ? { secretValues: { apiKey: apiKey.trim() } } : {}),
      });
      if (!result.ok) {
        throw new Error(`${result.error.category}: ${result.error.message}`);
      }
      setProbeResults(result.value.results);
      setSuggestedEndpointId(result.value.suggestedEndpointId);
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
        { displayName, connection, defaultModel, instruction, apiKey },
        isOptimizerProfile,
      )) {
        const savedProfile = await persistProfile();
        if (savedProfile) {
          await onProfilesChanged(savedProfile.profileId);
        }
      }
      const refreshed = await models.refresh();
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
  const modelListNotice = models.error
    ? {
        tone: 'warning' as const,
        message: t.settings.modelListFailed,
        detail: models.error,
        detailCopyable: true,
      }
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
      </header>

      <div className="scroll scroll-footer-pad">
        {detail.loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
        {detail.error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{detail.error}</div>}
        {detail.profile && (
          <ProviderProfileEditor
            connectionTitle={t.settings.connectionInfo}
            aliasValue={displayName}
            onAliasValue={setDisplayName}
            connection={connection}
            onConnectionChange={(next) => {
              setConnection(normalizeProviderConnectionDraft(next));
              setProbeResults([]);
              setSuggestedEndpointId(undefined);
            }}
            probeResults={connectionProbeResultById(probeResults)}
            suggestedEndpointId={suggestedEndpointId}
            apiKeyValue={apiKey}
            onApiKeyValue={setApiKey}
            apiKeyPlaceholder={detail.profile.secretRefs?.apiKey ? t.settings.savedSecretPlaceholder : 'sk-...'}
            showKey={showKey}
            onShowKeyChange={setShowKey}
            connectionStatus={saveNotice.notice}
            extraSections={isOptimizerProfile ? (
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
                    onValue={setInstruction}
                    placeholder={t.settings.instructionPlaceholder}
                  />
                </div>
              </div>
            ) : null}
            defaultModelSection={(
              <>
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
                <Button data-testid="provider-refresh-models-button" className="test-btn ui-button-block" variant="secondary" style={{ marginTop: 10 }} disabled={models.loading || busy} onClick={() => void refreshModels()}>
                  {models.loading ? t.settings.refreshingModels : t.settings.refreshModels}
                </Button>
              </>
            )}
            testBusy={busy}
            onTest={() => void test()}
            testMeta={testMeta}
            testStatus={testNotice.notice}
          />
        )}
      </div>

      <footer className="det-footer">
        <div className="settings-detail-footer-inner">
          <Button data-testid="provider-save-button" className="btn-save ui-button-block" variant="accent" disabled={busy || !detail.profile} onClick={() => void save()}>{t.common.save}</Button>
          {!isOptimizerProfile && (
            <IconButton
              data-testid="provider-delete-button"
              className="btn-del"
              variant="negative"
              compactSquare
              icon={<Icon name="trash" />}
              tooltip={t.common.delete}
              disabled={busy || !detail.profile}
              onClick={() => void remove()}
            />
          )}
        </div>
      </footer>
    </div>
  );
}

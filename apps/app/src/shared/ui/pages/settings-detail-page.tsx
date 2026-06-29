import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { providerConfigFromForm, useProfileDetail, useProfileModels } from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { ProviderProfileEditor } from '../components/provider-profile-editor';
import { StatusNotice } from '../components/status-notice';
import { UxpTextArea } from '../components/uxp-form-controls';
import { useI18n } from '../i18n/i18n-context';
import { Button, ActionButton, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { statusFromProviderTestResult, type ProviderStatus } from '../provider-status';
import { ComposerSelect } from '../components/composer-select';

interface SettingsDetailPageProps {
  readonly onNav: (view: string) => void;
  readonly profileId: string | null;
  readonly onProfilesChanged: (profileId: string | null) => Promise<void>;
}

function formatElapsedMs(startedAt: number): string {
  return `${Math.max(1, Math.round(performance.now() - startedAt))} ms`;
}

function readConfigString(profile: ProviderProfile, key: string): string {
  const value = profile.config[key];
  return typeof value === 'string' ? value : '';
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

export function SettingsDetailPage({ onNav, profileId, onProfilesChanged }: SettingsDetailPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const detail = useProfileDetail(services, profileId);
  const models = useProfileModels(services, profileId);
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [instruction, setInstruction] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<ProviderStatus | null>(null);
  const [testStatus, setTestStatus] = useState<ProviderStatus | null>(null);
  const [testMeta, setTestMeta] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const lastLoadedProfileIdRef = useRef<string | null>(null);
  const isOptimizerProfile = detail.profile?.providerId === 'prompt-optimize';

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    setDisplayName(detail.profile.displayName);
    setBaseUrl(readConfigString(detail.profile, 'baseURL'));
    setDefaultModel(readConfigString(detail.profile, 'defaultModel'));
    setInstruction(readConfigString(detail.profile, 'instruction'));
    setApiKey('');
    setModelMenuOpen(false);
  }, [detail.profile]);

  useEffect(() => {
    const nextProfileId = detail.profile?.profileId ?? null;
    if (lastLoadedProfileIdRef.current === nextProfileId) {
      return;
    }
    lastLoadedProfileIdRef.current = nextProfileId;
    setSaveStatus(null);
    setTestStatus(null);
    setTestMeta(null);
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
      config: {
        ...detail.profile.config,
        ...providerConfigFromForm(
          detail.profile.providerId,
          displayName.trim() || detail.profile.displayName,
          family,
          baseUrl.trim(),
          defaultModel,
          isOptimizerProfile ? instruction : undefined,
        ),
      },
      ...(apiKey.trim() ? { secretValues: { apiKey: apiKey.trim() } } : {}),
    });
  };

  const save = async () => {
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.entered', { profileId });
    setBusy(true);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.busy_set', { busy: true, profileId });
    setSaveStatus(null);
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
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.before_success_status', {
          profileId: profile.profileId,
          providerId: profile.providerId,
        }, {
          profile_id: profile.profileId,
          provider_id: profile.providerId,
        });
        setSaveStatus({ tone: 'success', message: t.settings.saved });
        await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.after_success_status', {
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
      }
    } catch (error) {
      await services.diagnostics?.failure('uxp.ui.settings_detail.save.failed', error, { profileId });
      setSaveStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
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
      hasStatus: saveStatus !== null || testStatus !== null,
    }, {
      profile_id: detail.profile.profileId,
      provider_id: detail.profile.providerId,
    });
  }, [busy, detail.profile, saveStatus, testStatus]);

  const test = async () => {
    const startedAt = performance.now();
    setBusy(true);
    setTestStatus(null);
    setTestMeta(null);
    try {
      const profile = await persistProfile();
      if (profile) {
        await onProfilesChanged(profile.profileId);
      }
      if (isOptimizerProfile && profile) {
        const result = await services.commands.validatePromptOptimizerProfile(profile.profileId);
        if (result.ok) {
          setTestStatus({ tone: 'success', message: t.settings.testSuccess });
          setTestMeta(`${t.settings.testResultPrefix} · ${formatElapsedMs(startedAt)}`);
          await detail.reload();
          await onProfilesChanged(profile.profileId);
        } else {
          setTestStatus({
            tone: 'error',
            message: result.error.category === 'validation'
              ? result.error.message
              : `${result.error.category}: ${result.error.message}`,
          });
          setTestMeta(`${t.settings.testResultPrefix} · ${formatElapsedMs(startedAt)}`);
        }
        return;
      }
      const result = await detail.test(true);
      setTestStatus(statusFromProviderTestResult(result, t));
      setTestMeta(`${t.settings.testResultPrefix} · ${formatElapsedMs(startedAt)}`);
    } catch (error) {
      setTestStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
      setTestMeta(`${t.settings.testResultPrefix} · ${formatElapsedMs(startedAt)}`);
    } finally {
      setBusy(false);
    }
  };

  const refreshModels = async () => {
    setTestStatus(null);
    setTestMeta(null);
    try {
      const refreshed = await models.refresh();
      if (refreshed.length === 0) {
        setTestStatus({ tone: 'warning', message: t.settings.configValidProviderNoModels });
      }
    } catch (error) {
      setTestStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const modelOptions = useMemo(
    () => models.models.map((model) => ({
      id: model.id,
      label: model.displayName ?? model.id,
    })),
    [models.models],
  );

  const remove = async () => {
    setBusy(true);
    setSaveStatus(null);
    try {
      await detail.remove();
      await onProfilesChanged(null);
      onNav('settings');
    } catch (error) {
      setSaveStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const modelSelectionLabel = modelOptions.find((option) => option.id === defaultModel)?.label ?? defaultModel.trim();
  const modelTriggerValue = modelSelectionLabel || t.settings.customModelId;
  const modelSelectDisabled = busy || models.loading || modelOptions.length === 0;
  const modelListNotice = models.error
    ? { tone: 'warning' as const, message: t.settings.modelListFailed }
    : modelOptions.length === 0
      ? { tone: 'info' as const, message: t.settings.modelListEmpty }
      : null;

  if (!profileId) {
    return (
      <div className="page page-enter">
        <header className="hdr">
          <ActionButton className="hdr-btn" quiet label={t.common.back} onClick={() => onNav('settings')}>
            <Icon name="chevron-left" />
          </ActionButton>
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
        <ActionButton
          data-testid="provider-detail-back-button"
          className="hdr-btn"
          quiet
          label={t.common.back}
          onClick={() => onNav('settings')}
        >
          <Icon name="chevron-left" />
        </ActionButton>
        <div className="page-header-meta">
          <div className="hdr-title page-header-title">{detail.profile?.displayName ?? 'Provider'}</div>
        </div>
        <ActionButton
          data-testid="provider-detail-refresh-button"
          className="hdr-btn"
          quiet
          label={t.common.refresh}
          onClick={() => void detail.reload()}
        >
          <Icon name="refresh" />
        </ActionButton>
      </header>

      <div className="scroll scroll-footer-pad">
        {detail.loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
        {detail.error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{detail.error}</div>}
        {detail.profile && (
          <ProviderProfileEditor
            connectionTitle={t.settings.connectionInfo}
            aliasValue={displayName}
            onAliasValue={setDisplayName}
            baseUrlValue={baseUrl}
            onBaseUrlValue={setBaseUrl}
            apiKeyValue={apiKey}
            onApiKeyValue={setApiKey}
            apiKeyPlaceholder={detail.profile.secretRefs?.apiKey ? t.settings.savedSecretPlaceholder : 'sk-...'}
            showKey={showKey}
            onShowKeyChange={setShowKey}
            connectionStatus={saveStatus}
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
                  <FieldLabel htmlFor="provider-default-model-selector">{t.settings.defaultModel}</FieldLabel>
                  <ComposerSelect
                    label={t.settings.defaultModel}
                    value={modelTriggerValue}
                    disabled={modelSelectDisabled}
                    open={modelMenuOpen}
                    onOpenChange={setModelMenuOpen}
                    options={modelOptions}
                    selectedId={defaultModel}
                    onSelect={(id) => {
                      setDefaultModel(id);
                      setModelMenuOpen(false);
                    }}
                    testId="provider-default-model-selector"
                    triggerId="provider-default-model-selector"
                    containerClassName="cmp-select cmp-select-model provider-model-select"
                    menuClassName="cmp-select-menu cmp-select-menu-model"
                  />
                </div>
                <div className="field">
                  <FieldLabel htmlFor="provider-default-model-input">{t.settings.customModelId}</FieldLabel>
                  <TextField
                    data-testid="provider-default-model-input"
                    id="provider-default-model-input"
                    className="field-input mono ui-field-control"
                    placeholder={t.settings.customModelId}
                    value={defaultModel}
                    onValue={setDefaultModel}
                  />
                  <HelpText className="field-hint">
                    {modelSelectionLabel
                      ? `${t.settings.selectedModel}: ${modelSelectionLabel}`
                      : t.settings.customModelId}
                  </HelpText>
                </div>
                {modelListNotice && <StatusNotice tone={modelListNotice.tone} message={modelListNotice.message} />}
                {models.error && <StatusNotice tone="error" message={models.error} />}
                <Button data-testid="provider-refresh-models-button" className="test-btn ui-button-block" variant="secondary" style={{ marginTop: 10 }} disabled={models.loading || busy} onClick={() => void refreshModels()}>
                  {models.loading ? t.settings.refreshingModels : t.settings.refreshModels}
                </Button>
              </>
            )}
            testBusy={busy}
            onTest={() => void test()}
            testMeta={testMeta}
            testStatus={testStatus}
          />
        )}
      </div>

      <footer className="det-footer">
        <div className="settings-detail-footer-inner">
          <Button data-testid="provider-save-button" className="btn-save ui-button-block" variant="accent" disabled={busy || !detail.profile} onClick={() => void save()}>{t.common.save}</Button>
          {!isOptimizerProfile && (
            <Button data-testid="provider-delete-button" className="btn-del ui-button-block" variant="negative" aria-label={t.common.delete} disabled={busy || !detail.profile} onClick={() => void remove()}>
              <Icon name="trash" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

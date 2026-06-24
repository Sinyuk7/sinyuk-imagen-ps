import { useEffect, useState } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { providerConfigFromForm, useProfileDetail, useProfileModels } from '../hooks/use-provider-settings';
import { Icon } from '../components/icons';
import { StatusNotice } from '../components/status-notice';
import { UxpCheckbox, UxpTextField } from '../components/uxp-form-controls';
import { useI18n } from '../i18n/i18n-context';
import { statusFromProviderTestResult, type ProviderStatus } from '../provider-status';

interface SettingsDetailPageProps {
  readonly onNav: (view: string) => void;
  readonly profileId: string | null;
  readonly onProfilesChanged: (profileId: string | null) => Promise<void>;
}

function readConfigString(profile: ProviderProfile, key: string): string {
  const value = profile.config[key];
  return typeof value === 'string' ? value : '';
}

function profileFormCheckpointAttrs(
  profile: ProviderProfile | null,
  form: {
    readonly enabled: boolean;
    readonly apiKey: string;
    readonly defaultModel: string;
  },
): Record<string, unknown> {
  return {
    profileId: profile?.profileId ?? null,
    providerId: profile?.providerId ?? null,
    enabled: form.enabled,
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
  const [enabled, setEnabled] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!detail.profile) {
      return;
    }
    setDisplayName(detail.profile.displayName);
    setBaseUrl(readConfigString(detail.profile, 'baseURL'));
    setDefaultModel(readConfigString(detail.profile, 'defaultModel'));
    setEnabled(detail.profile.enabled);
    setApiKey('');
  }, [detail.profile]);

  const persistProfile = async (): Promise<ProviderProfile | null> => {
    if (!detail.profile) {
      await services.diagnostics?.checkpoint('uxp.ui.settings_detail.persist.no_profile', { profileId });
      return null;
    }
    const family = String(detail.profile.config.family ?? detail.profile.providerId);
    await services.diagnostics?.checkpoint(
      'uxp.ui.settings_detail.persist.input_prepared',
      profileFormCheckpointAttrs(detail.profile, { enabled, apiKey, defaultModel }),
      {
        profile_id: detail.profile.profileId,
        provider_id: detail.profile.providerId,
      },
    );
    return detail.save({
      profileId: detail.profile.profileId,
      providerId: detail.profile.providerId,
      displayName: displayName.trim() || detail.profile.displayName,
      enabled,
      config: {
        ...detail.profile.config,
        ...providerConfigFromForm(
          detail.profile.providerId,
          displayName.trim() || detail.profile.displayName,
          family,
          baseUrl.trim(),
          defaultModel,
        ),
      },
      ...(apiKey.trim() ? { secretValues: { apiKey: apiKey.trim() } } : {}),
    });
  };

  const save = async () => {
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.entered', { profileId });
    setBusy(true);
    await services.diagnostics?.checkpoint('uxp.ui.settings_detail.save.busy_set', { busy: true, profileId });
    setStatus(null);
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
        setStatus({ tone: 'success', message: t.settings.saved });
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
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
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
      hasStatus: status !== null,
    }, {
      profile_id: detail.profile.profileId,
      provider_id: detail.profile.providerId,
    });
  }, [busy, detail.profile, status]);

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const profile = await persistProfile();
      if (profile) {
        await onProfilesChanged(profile.profileId);
      }
      const result = await detail.test(true);
      setStatus(statusFromProviderTestResult(result, t));
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const refreshModels = async () => {
    setStatus(null);
    try {
      const refreshed = await models.refresh();
      if (refreshed.length === 0) {
        setStatus({ tone: 'warning', message: t.settings.configValidProviderNoModels });
      }
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const remove = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await detail.remove();
      await onProfilesChanged(null);
      onNav('settings');
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  if (!profileId) {
    return (
      <div className="page page-enter">
        <header className="hdr">
          <button className="hdr-btn" onClick={() => onNav('settings')}>
            <Icon name="chevron-left" />
          </button>
          <div className="hdr-title">Provider</div>
          <div style={{ width: 32 }} />
        </header>
        <div className="scroll">
          <div style={{ padding: 16, color: 'var(--txd)', fontSize: 12 }}>{t.settings.noProfileSelected}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-enter">
      <header className="hdr">
        <button className="hdr-btn" onClick={() => onNav('settings')}>
          <Icon name="chevron-left" />
        </button>
        <div className="hdr-center">
          <span style={{ fontFamily: 'var(--fD)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>
            {detail.profile?.displayName ?? 'Provider'}
          </span>
          <div className="status-inline tight" style={{ fontFamily: 'var(--fM)', fontSize: 10, color: enabled ? 'var(--ok)' : 'var(--txd)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: enabled ? 'var(--ok)' : 'var(--txd)', display: 'inline-block' }} />
            {enabled ? t.common.enabled : t.common.disabled}
          </div>
        </div>
        <button className="hdr-btn" onClick={() => void detail.reload()}>
          <Icon name="refresh" />
        </button>
      </header>

      <div className="scroll">
        {detail.loading && <div style={{ padding: 16, color: 'var(--txd)', fontSize: 12 }}>{t.settings.loading}</div>}
        {detail.error && <div style={{ padding: 16, color: 'var(--er)', fontSize: 12 }}>{detail.error}</div>}
        {detail.profile && (
          <>
            <div className="section">
              <div className="section-title">{t.settings.connectionInfo}</div>
              <div className="field">
                <label className="field-label">{t.settings.alias}</label>
                <UxpTextField className="field-input" value={displayName} onValue={setDisplayName} />
              </div>
              <div className="field">
                <label className="field-label">Base URL</label>
                <UxpTextField className="field-input mono" value={baseUrl} onValue={setBaseUrl} />
              </div>
              <div className="field">
                <label className="field-label">API Key</label>
                <div className="pw-wrap">
                  <UxpTextField
                    type={showKey ? 'text' : 'password'}
                    className="field-input mono"
                    placeholder={detail.profile.secretRefs?.apiKey ? t.settings.savedSecretPlaceholder : 'sk-...'}
                    value={apiKey}
                    onValue={setApiKey}
                  />
                  <button className="pw-toggle" onClick={() => setShowKey((shown) => !shown)}>
                    <Icon name={showKey ? 'eye-off' : 'eye'} />
                  </button>
                </div>
              </div>
              <label className="status-inline loose" style={{ color: 'var(--txm)', fontSize: 12 }}>
                <UxpCheckbox checked={enabled} onChecked={setEnabled} />
                {t.settings.enableProfile}
              </label>
            </div>

            <div className="section">
              <div className="section-title">{t.settings.defaultModel}</div>
              <div className="chips">
                {models.models.map((model) => (
                  <button
                    key={model.id}
                    className={`chip${model.id === defaultModel ? ' act' : ''}`}
                    onClick={() => setDefaultModel(model.id)}
                  >
                    {model.displayName ?? model.id}
                  </button>
                ))}
                <UxpTextField
                  className="field-input mono"
                  style={{ marginTop: 8 }}
                  placeholder={t.settings.customModelId}
                  value={defaultModel}
                  onValue={setDefaultModel}
                />
              </div>
              {models.error && <StatusNotice tone="error" message={models.error} />}
              <button className="test-btn" style={{ marginTop: 10 }} disabled={models.loading || busy} onClick={() => void refreshModels()}>
                {models.loading ? t.settings.refreshingModels : t.settings.refreshModels}
              </button>
            </div>

            <div className="test-area">
              <button className="test-btn" disabled={busy} onClick={() => void test()}>
                {busy
                  ? <><Icon name="spinner" size={13} className="spin" /> {t.settings.testingConnection}</>
                  : <><Icon name="arrow-right" /> {t.settings.testConnection}</>
                }
              </button>
              {status && <StatusNotice tone={status.tone} message={status.message} />}
            </div>
          </>
        )}
      </div>

      <footer className="det-footer">
        <button className="btn-save" disabled={busy || !detail.profile} onClick={() => void save()}>{t.common.save}</button>
        <button className="btn-del" disabled={busy || !detail.profile} onClick={() => void remove()}>
          <Icon name="trash" />
        </button>
      </footer>
    </div>
  );
}

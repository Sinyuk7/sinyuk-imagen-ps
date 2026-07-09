import { useEffect, useMemo, useState } from 'react';
import type { ProfileModelItem, ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { ProviderSettingsPageHeader } from '../components/provider-settings-sections';
import { SettingsListRow } from '../components/settings-list-row';
import { StatusNotice } from '../components/status-notice';
import { Icon } from '../components/icons';
import { IconButton } from '../primitives/icon-button';
import { Button, HelpText } from '../primitives/native-controls';
import { useI18n } from '../i18n/i18n-context';
import { configurationInstanceLabel, modelInfoFromProfileItem } from '../model-info';

interface ProfileModelsPageProps {
  readonly profile: ProviderProfile;
  readonly onBack: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onCreate: () => void;
  readonly onEdit: (modelId: string) => void;
  readonly onSuggestion: (modelId: string) => void;
}

function modelAvatarLabel(modelId: string): string {
  const compact = modelId.replace(/[^a-zA-Z0-9]/g, '');
  return compact.slice(0, 2).toUpperCase() || 'M';
}

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

export function ProfileModelsPage({ profile, onBack, onChanged, onCreate, onEdit, onSuggestion }: ProfileModelsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [models, setModels] = useState<readonly ProfileModelItem[]>([]);
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownedIds = useMemo(() => new Set(models.map((model) => model.modelId)), [models]);
  const visibleSuggestions = useMemo(
    () => suggestions.filter((modelId) => !ownedIds.has(modelId)),
    [ownedIds, suggestions],
  );

  const reload = async () => {
    setLoading(true);
    try {
      const result = await services.commands.listProfileModels(profile.profileId);
      if (!result.ok) {
        throw new Error(commandMessage(result.error));
      }
      setModels(result.value);
      setError(null);
    } catch (nextError) {
      setModels([]);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSuggestions([]);
    void reload();
  }, [profile.profileId]);

  const refreshSuggestions = async () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      const result = await services.commands.refreshProfileModels(profile.profileId);
      if (!result.ok) {
        throw new Error(commandMessage(result.error));
      }
      const seen = new Set<string>();
      const next = result.value
        .map((model) => model.id.trim())
        .filter((modelId) => {
          if (!modelId || seen.has(modelId)) {
            return false;
          }
          seen.add(modelId);
          return true;
        });
      setSuggestions(next);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setRefreshing(false);
    }
  };

  const setDefault = async (modelId: string) => {
    const result = await services.commands.saveProviderProfile({
      profileId: profile.profileId,
      apiFormat: profile.apiFormat,
      defaultModelId: modelId,
    });
    if (!result.ok) {
      setError(commandMessage(result.error));
      return;
    }
    await onChanged();
    await reload();
  };

  return (
    <div className="page page-enter settings-page">
      <ProviderSettingsPageHeader
        backButtonTestId="profile-models-back-button"
        title={<div className="hdr-title">{t.settings.modelConfiguration}</div>}
        onBack={onBack}
        rightSlot={(
          <IconButton
            data-testid="profile-models-add-button"
            className="hdr-btn"
            quiet
            icon={<Icon name="add" />}
            tooltip={t.settings.addNewModel}
            onClick={onCreate}
          />
        )}
      />
      <div className="scroll">
        <div className="settings-detail-layout settings-detail-layout-editor">
          <section className="section generation-settings-section">
            <div className="settings-inline-heading-row model-config-list-heading">
              <div className="section-title settings-section-heading">{profile.displayName}</div>
              <Button
                className="btn-secondary"
                disabled={refreshing}
                onClick={() => void refreshSuggestions()}
              >
                {refreshing ? t.settings.refreshingModels : t.settings.refreshModels}
              </Button>
            </div>
            <HelpText className="field-hint model-config-list-hint">{t.settings.modelConfigurationHint}</HelpText>
            {loading ? <HelpText className="field-hint">{t.common.loading}</HelpText> : null}
            {error ? <StatusNotice tone="warning" message={error} copyText={error} /> : null}
            {!loading && models.length === 0 ? (
              <StatusNotice
                tone="info"
                message={t.settings.modelConfigurationEmpty}
                detail={t.settings.modelConfigurationSaveHint}
              />
            ) : null}
            <div className="model-config-list">
              {models.map((model) => {
                const label = configurationInstanceLabel(modelInfoFromProfileItem(model));
                const isDefault = model.modelId === profile.defaultModelId;
                return (
                  <SettingsListRow
                    key={model.modelId}
                    testId={`profile-model-row-${model.modelId}`}
                    title={label}
                    leading={(
                      <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-accent-default)' }}>
                        <span>{modelAvatarLabel(model.modelId)}</span>
                      </div>
                    )}
                    meta={(
                      <>
                        <span className="prov-model model-config-meta-primary">{model.wireModelId ?? model.modelId}</span>
                        <span className="prov-meta-sep" aria-hidden="true">·</span>
                        <span className="prov-family model-config-meta-secondary">{isDefault ? t.common.default : profile.apiFormat}</span>
                      </>
                    )}
                    end={!isDefault ? (
                      <Button
                        className="btn-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void setDefault(model.modelId);
                        }}
                      >
                        {t.common.setDefault}
                      </Button>
                    ) : undefined}
                    onOpen={() => onEdit(model.modelId)}
                  />
                );
              })}
            </div>
            {visibleSuggestions.length > 0 ? (
              <>
                <div className="sec-lbl">{t.settings.discoveredModels}</div>
                <div className="model-config-list">
                  {visibleSuggestions.map((modelId) => (
                    <SettingsListRow
                      key={modelId}
                      testId={`profile-model-suggestion-row-${modelId}`}
                      title={modelId}
                      leading={(
                        <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-informative)' }}>
                          <Icon name="magic-wand" size={14} />
                        </div>
                      )}
                      meta={<span className="prov-summary">{t.settings.discoverySuggestion}</span>}
                      onOpen={() => onSuggestion(modelId)}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

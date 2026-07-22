import { useEffect, useMemo, useState } from 'react';
import type { ProfileModelItem, ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import { useI18n } from '../i18n/i18n-context';
import {
  HelpText,
  Icon,
  IconButton,
  List,
  ListStateItem,
  PageFrame,
  PageScroll,
  ProviderSettingsPageHeader,
  SettingsListRow,
  useToast,
} from '../ui-system';

interface ProfileModelsPageProps {
  readonly profile: ProviderProfile;
  readonly onBack: () => void;
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

export function ProfileModelsPage({ profile, onBack, onCreate, onEdit, onSuggestion }: ProfileModelsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const { show } = useToast();
  const [models, setModels] = useState<readonly ProfileModelItem[]>([]);
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

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
      setListError(null);
    } catch (nextError) {
      setModels([]);
      setListError(nextError instanceof Error ? nextError.message : String(nextError));
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
      setSuggestions((current) => {
        const known = new Set(current);
        return [...current, ...next.filter((modelId) => !known.has(modelId))];
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      show(message, 'negative', { key: `profile-models-refresh:${profile.profileId}`, durationMs: null });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <PageFrame watch={`profile-models:${profile.profileId}`}>
      <div className="page page-enter settings-page">
        <ProviderSettingsPageHeader
          backButtonTestId="profile-models-back-button"
          title={<div className="hdr-title">{profile.displayName}</div>}
          onBack={onBack}
          sideClassName="profile-models-header-actions"
          rightClassName="profile-models-header-actions"
          rightSlot={(
            <>
              <IconButton
                data-testid="profile-models-refresh-button"
                className="hdr-btn profile-models-header-refresh"
                quiet
                icon={<Icon name={refreshing ? 'spinner' : 'refresh'} />}
                tooltip={refreshing ? t.settings.refreshingModels : t.settings.refreshModels}
                disabled={refreshing}
                onClick={() => void refreshSuggestions()}
              />
              <IconButton
                data-testid="profile-models-add-button"
                className="hdr-btn profile-models-header-add"
                quiet
                icon={<Icon name="add" />}
                tooltip={t.settings.addNewModel}
                onClick={onCreate}
              />
            </>
          )}
        />
        <PageScroll>
          <div className="settings-detail-layout settings-detail-layout-editor">
            <section className="ui-settings-list-section profile-models-list-section" data-testid="profile-models-list-section">
              <HelpText className="field-hint model-config-list-hint">{t.settings.modelConfigurationHint}</HelpText>
              <List className="model-config-list" aria-label={t.settings.modelConfiguration}>
                {loading && models.length === 0 ? (
                  <ListStateItem data-testid="profile-model-list-loading" kind="loading" title={t.common.loading} />
                ) : null}
                {!loading && listError && models.length === 0 ? (
                  <ListStateItem
                    action={{ label: t.common.refresh, onPress: () => void reload() }}
                    data-testid="profile-model-list-error"
                    description={listError}
                    kind="error"
                  />
                ) : null}
                {!loading && !listError && models.length === 0 ? (
                  <ListStateItem
                    data-testid="profile-model-empty-notice"
                    description={t.settings.modelConfigurationSaveHint}
                    kind="empty"
                    title={t.settings.modelConfigurationEmpty}
                  />
                ) : null}
                {!loading && !listError ? models.map((model) => {
                  const wireModelId = model.wireModelId ?? model.modelId;
                  const displayName = model.displayName?.trim();
                  return (
                    <SettingsListRow
                      key={model.modelId}
                      testId={`profile-model-row-${model.modelId}`}
                      title={wireModelId}
                      leading={(
                        <div className="prov-ico profile-model-avatar">
                          <span>{modelAvatarLabel(model.modelId)}</span>
                        </div>
                      )}
                      meta={displayName ? <span className="model-config-meta-note">{displayName}</span> : undefined}
                      onOpen={() => onEdit(model.modelId)}
                    />
                  );
                }) : null}
              </List>
              {visibleSuggestions.length > 0 ? (
                <>
                  <div className="sec-lbl">{t.settings.discoveredModels}</div>
                  <List className="model-config-list" aria-label={t.settings.discoveredModels}>
                    {visibleSuggestions.map((modelId) => (
                      <SettingsListRow
                        key={modelId}
                        testId={`profile-model-suggestion-row-${modelId}`}
                        title={modelId}
                        leading={(
                          <div className="prov-ico profile-model-avatar profile-model-avatar-suggestion">
                            <Icon name="magic-wand" size={14} />
                          </div>
                        )}
                        meta={<span className="prov-summary">{t.settings.discoverySuggestion}</span>}
                        onOpen={() => onSuggestion(modelId)}
                      />
                    ))}
                  </List>
                </>
              ) : null}
            </section>
          </div>
        </PageScroll>
      </div>
    </PageFrame>
  );
}

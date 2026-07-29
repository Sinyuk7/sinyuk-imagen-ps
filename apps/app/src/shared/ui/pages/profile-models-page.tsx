import { useEffect, useState } from 'react';
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
} from '../ui-system';

interface ProfileModelsPageProps {
  readonly profile: ProviderProfile;
  readonly onBack: () => void;
  readonly onCreate: () => void;
  readonly onEdit: (modelId: string) => void;
}

function modelAvatarLabel(modelId: string): string {
  const compact = modelId.replace(/[^a-zA-Z0-9]/g, '');
  return compact.slice(0, 2).toUpperCase() || 'M';
}

function commandMessage(error: { readonly category: string; readonly message: string }): string {
  return `${error.category}: ${error.message}`;
}

export function ProfileModelsPage({ profile, onBack, onCreate, onEdit }: ProfileModelsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [models, setModels] = useState<readonly ProfileModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

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
    void reload();
  }, [profile.profileId]);

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
            </section>
          </div>
        </PageScroll>
      </div>
    </PageFrame>
  );
}

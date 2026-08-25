import { useState } from 'react';
import { useAppServices } from '../../../../ports/app-services-context';
import { useI18n } from '../../../i18n/i18n-context';
import { ProfileForm } from '../shared/profile-form';
import { ProfilePageFrame } from '../shared/profile-page-frame';
import { commandError, createProviderProfileId, type ProviderProfilePageProps } from '../shared/profile-page-props';

/** Gemini 专用 Profile 创建/编辑页。 */
export function GeminiProfilePage(props: ProviderProfilePageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [profileId] = useState(() => props.profile?.profileId ?? createProviderProfileId('gemini'));
  return (
    <ProfilePageFrame watch={`gemini-profile:${profileId}`} title="Gemini" backLabel={t.common.back} onBack={props.onBack}>
      <ProfileForm
        initialDisplayName={props.profile?.displayName ?? 'Gemini'}
        hasSavedApiKey={Boolean(props.profile?.secretRefs?.apiKey)}
        existingDisplayNames={props.existingDisplayNames}
        onCancel={props.onBack}
        onSave={async (value) => {
          const result = await services.commands.saveProviderSurfaceProfile({
            implementationId: 'gemini-generate-content',
            profileId,
            ...value,
          });
          if (!result.ok) throw commandError(result);
          await props.onSaved(result.value);
        }}
        onDelete={props.profile ? async () => {
          const result = await services.commands.deleteProviderProfile(profileId);
          if (!result.ok) throw commandError(result);
          await props.onDeleted(profileId);
        } : undefined}
        onTest={props.profile && props.surface.canTestConnection ? async () => {
          const result = await services.commands.testProviderProfile(profileId, {
            connect: true,
            modelId: props.surface.defaultModelId,
          });
          if (!result.ok) throw commandError(result);
          if (result.value.connectivity?.status !== 'verified') {
            throw new Error(result.value.connectivity?.message ?? t.settings.connectionFailed);
          }
        } : undefined}
      />
    </ProfilePageFrame>
  );
}

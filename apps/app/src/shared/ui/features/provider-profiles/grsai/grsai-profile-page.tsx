import { useState } from 'react';
import { useAppServices } from '../../../../ports/app-services-context';
import { useI18n } from '../../../i18n/i18n-context';
import { ProfileForm } from '../shared/profile-form';
import { ProfilePageFrame } from '../shared/profile-page-frame';
import { commandError, createProviderProfileId, type ProviderProfilePageProps } from '../shared/profile-page-props';
import { useProfileBilling } from '../../../hooks/use-profile-billing';
import { formatBillingPrimary } from '../../../../domain/mappers';
import { Button, SettingsFormSection, StatusNotice } from '../../../ui-system';

/** GRSAI 专用 Profile 创建/编辑页。 */
export function GrsaiProfilePage(props: ProviderProfilePageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [profileId] = useState(() => props.profile?.profileId ?? createProviderProfileId('grsai'));
  const billing = useProfileBilling(services, props.profile ? profileId : null);
  return (
    <ProfilePageFrame watch={`grsai-profile:${profileId}`} title="GRSAI" backLabel={t.common.back} onBack={props.onBack}>
      <ProfileForm
        initialDisplayName={props.profile?.displayName ?? 'GRSAI'}
        hasSavedApiKey={Boolean(props.profile?.secretRefs?.apiKey)}
        enableBillingToken
        hasSavedBillingToken={Boolean(props.profile?.secretRefs?.billingToken)}
        existingDisplayNames={props.existingDisplayNames}
        onCancel={props.onBack}
        onSave={async (value) => {
          const result = await services.commands.saveProviderSurfaceProfile({
            implementationId: 'grsai-generate',
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
      />
      {props.profile ? (
        <SettingsFormSection testId="grsai-billing-section">
          <div data-testid="grsai-billing-value">
            {billing.loading ? 'Checking balance…' : formatBillingPrimary(billing.billing) ?? 'Balance unavailable'}
          </div>
          {billing.billing?.balance?.checkedAt ? (
            <div data-testid="grsai-billing-checked-at">Checked {new Date(billing.billing.balance.checkedAt).toLocaleString()}</div>
          ) : null}
          {billing.billing?.refreshState === 'error' || billing.error ? (
            <StatusNotice tone="warning" message={billing.error ?? 'Balance refresh failed'} />
          ) : null}
          <Button data-testid="grsai-billing-refresh" disabled={billing.loading} onClick={() => void billing.refresh()}>
            {billing.loading ? 'Checking…' : 'Refresh'}
          </Button>
        </SettingsFormSection>
      ) : null}
    </ProfilePageFrame>
  );
}

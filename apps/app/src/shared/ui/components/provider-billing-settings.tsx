import { FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { TextSelect } from './text-select';
import { useI18n } from '../i18n/i18n-context';
import type { ProviderBillingDraft } from '../hooks/use-provider-settings';

interface BillingModeOption {
  readonly id: ProviderBillingDraft['mode'];
  readonly label: string;
}

interface ProviderBillingSettingsProps {
  readonly billing: ProviderBillingDraft;
  readonly onBillingChange: (billing: ProviderBillingDraft) => void;
  readonly billingModeOptions: readonly BillingModeOption[];
  readonly modeMenuOpen: boolean;
  readonly onModeMenuOpenChange: (open: boolean) => void;
  readonly disabled?: boolean;
}

export function ProviderBillingSettings({
  billing,
  onBillingChange,
  billingModeOptions,
  modeMenuOpen,
  onModeMenuOpenChange,
  disabled = false,
}: ProviderBillingSettingsProps) {
  const { messages: t } = useI18n();
  const selectedModeLabel =
    billingModeOptions.find((option) => option.id === billing.mode)?.label ?? billing.mode;

  return (
    <div className="field">
      <TextSelect
        label={t.settings.billingMode}
        value={selectedModeLabel}
        disabled={disabled}
        open={modeMenuOpen}
        onOpenChange={onModeMenuOpenChange}
        options={billingModeOptions}
        selectedId={billing.mode}
        onSelect={(id) => onBillingChange({
          ...billing,
          mode: id as ProviderBillingDraft['mode'],
        })}
        testId="provider-billing-mode-selector"
        triggerId="provider-billing-mode-selector"
        containerClassName="cmp-select cmp-select-model provider-model-select"
        menuClassName="cmp-select-menu cmp-select-menu-model"
      />
      <HelpText className="field-hint">{t.settings.billingModeHint}</HelpText>
      {billing.mode === 'new-api' && (
        <>
          <div className="field" style={{ marginTop: 10 }}>
            <FieldLabel htmlFor="provider-billing-user-id-input">{t.settings.billingUserId}</FieldLabel>
            <TextField
              data-testid="provider-billing-user-id-input"
              id="provider-billing-user-id-input"
              className="field-input mono ui-field-control"
              placeholder="10001"
              value={billing.userId}
              onValue={(value) => onBillingChange({ ...billing, userId: value })}
            />
            <HelpText className="field-hint">{t.settings.billingUserIdHint}</HelpText>
          </div>
          <div className="field">
            <FieldLabel htmlFor="provider-billing-access-token-input">{t.settings.billingAccessToken}</FieldLabel>
            <TextField
              data-testid="provider-billing-access-token-input"
              id="provider-billing-access-token-input"
              type="password"
              className="field-input mono ui-field-control"
              placeholder={billing.hasSavedAccessToken ? t.settings.savedSecretPlaceholder : 'sk-...'}
              value={billing.accessToken}
              onValue={(value) => onBillingChange({ ...billing, accessToken: value })}
            />
            <HelpText className="field-hint">
              {billing.hasSavedAccessToken ? t.settings.billingAccessTokenSavedHint : t.settings.billingAccessTokenHint}
            </HelpText>
          </div>
        </>
      )}
    </div>
  );
}

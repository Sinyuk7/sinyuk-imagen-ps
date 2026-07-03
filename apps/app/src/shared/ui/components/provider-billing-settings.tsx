import { Button, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { TextSelect } from './text-select';
import { useI18n } from '../i18n/i18n-context';
import { sanitizeProviderSecretValue, type ProviderBillingDraft } from '../hooks/use-provider-settings';

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
  readonly accessTokenPlaceholder?: string;
  readonly accessTokenSavedMeta?: string | null;
  readonly accessTokenSavedHint?: string | null;
  readonly accessTokenRemovalPending?: boolean;
  readonly onAccessTokenReplace?: () => void;
  readonly onAccessTokenRemove?: () => void;
  readonly userIdError?: string | null;
  readonly accessTokenError?: string | null;
}

export function ProviderBillingSettings({
  billing,
  onBillingChange,
  billingModeOptions,
  modeMenuOpen,
  onModeMenuOpenChange,
  disabled = false,
  accessTokenPlaceholder = 'sk-...',
  accessTokenSavedMeta = null,
  accessTokenSavedHint = null,
  accessTokenRemovalPending = false,
  onAccessTokenReplace,
  onAccessTokenRemove,
  userIdError = null,
  accessTokenError = null,
}: ProviderBillingSettingsProps) {
  const { messages: t } = useI18n();
  const selectedModeLabel =
    billingModeOptions.find((option) => option.id === billing.mode)?.label ?? billing.mode;

  return (
    <div className="billing-settings-form">
      <div className="field billing-settings-field billing-settings-mode-field">
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
        <HelpText className="field-hint billing-settings-hint">{t.settings.billingModeHint}</HelpText>
      </div>
      {billing.mode === 'new-api' && (
        <div className="billing-settings-grid">
          <div className="field billing-settings-field">
            <FieldLabel htmlFor="provider-billing-user-id-input">{t.settings.billingUserId}</FieldLabel>
            <TextField
              data-testid="provider-billing-user-id-input"
              id="provider-billing-user-id-input"
              className="field-input mono ui-field-control"
              placeholder="10001"
              value={billing.userId}
              onValue={(value) => onBillingChange({ ...billing, userId: sanitizeProviderSecretValue(value) })}
            />
            <HelpText className="field-hint billing-settings-hint" variant={userIdError ? 'negative' : undefined}>
              {userIdError ?? t.settings.billingUserIdHint}
            </HelpText>
          </div>
          <div className="field billing-settings-field billing-settings-field-spaced">
            <FieldLabel htmlFor="provider-billing-access-token-input">{t.settings.billingAccessToken}</FieldLabel>
            {accessTokenSavedMeta && !accessTokenRemovalPending ? (
              <div data-testid="provider-billing-access-token-saved-meta" className="settings-secret-meta">
                {accessTokenSavedMeta}
              </div>
            ) : null}
            {billing.hasSavedAccessToken && !accessTokenRemovalPending ? (
              <div className="settings-secret-actions">
                <Button data-testid="provider-billing-access-token-replace" className="settings-secret-action" variant="secondary" onClick={onAccessTokenReplace}>
                  {t.settings.replaceSecret}
                </Button>
                <Button data-testid="provider-billing-access-token-remove" className="settings-secret-action" variant="secondary" onClick={onAccessTokenRemove}>
                  {t.settings.removeSecret}
                </Button>
              </div>
            ) : null}
            <TextField
              data-testid="provider-billing-access-token-input"
              id="provider-billing-access-token-input"
              type="password"
              className="field-input mono ui-field-control"
              placeholder={billing.hasSavedAccessToken && !billing.accessToken ? t.settings.accessTokenReplacePlaceholder : accessTokenPlaceholder}
              value={billing.accessToken}
              onValue={(value) => onBillingChange({ ...billing, accessToken: sanitizeProviderSecretValue(value) })}
            />
            <HelpText
              data-testid={accessTokenRemovalPending ? 'provider-billing-access-token-removal-pending' : undefined}
              className="field-hint billing-settings-hint"
              variant={accessTokenRemovalPending || accessTokenError ? 'negative' : undefined}
            >
              {accessTokenRemovalPending
                ? t.settings.secretRemovalPending
                : accessTokenError ?? accessTokenSavedHint ?? (billing.hasSavedAccessToken ? t.settings.billingAccessTokenSavedHint : t.settings.billingAccessTokenHint)}
            </HelpText>
          </div>
        </div>
      )}
    </div>
  );
}

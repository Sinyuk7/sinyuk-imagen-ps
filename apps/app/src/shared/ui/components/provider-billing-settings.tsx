import { useState, useEffect } from 'react';
import { FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { Icon } from './icons';
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
  readonly accessTokenRemovalPending?: boolean;
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
  accessTokenRemovalPending = false,
  onAccessTokenRemove,
  userIdError = null,
  accessTokenError = null,
}: ProviderBillingSettingsProps) {
  const { messages: t } = useI18n();
  const [accessTokenEditing, setAccessTokenEditing] = useState(false);
  const selectedModeLabel =
    billingModeOptions.find((option) => option.id === billing.mode)?.label ?? billing.mode;

  useEffect(() => {
    setAccessTokenEditing(!billing.hasSavedAccessToken || billing.accessToken.length > 0);
  }, [billing.hasSavedAccessToken]);

  const accessTokenInputVisible = accessTokenEditing || accessTokenRemovalPending || !billing.hasSavedAccessToken;

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
            <div className="settings-field-header">
              <FieldLabel htmlFor="provider-billing-access-token-input">{t.settings.billingAccessToken}</FieldLabel>
              <div className="settings-field-header-actions">
                {billing.hasSavedAccessToken && !accessTokenRemovalPending ? (
                  <span data-testid="provider-billing-access-token-saved-meta" className="settings-secret-meta-inline">
                    {accessTokenSavedMeta}
                  </span>
                ) : null}
                {!accessTokenInputVisible && billing.hasSavedAccessToken ? (
                  <IconButton
                    data-testid="provider-billing-access-token-edit"
                    className="settings-icon-button"
                    compactSquare
                    icon={<Icon name="pencil" size={16} />}
                    tooltip={t.settings.editApiKey}
                    aria-label={t.settings.editApiKey}
                    onClick={() => setAccessTokenEditing(true)}
                  />
                ) : null}
                {billing.hasSavedAccessToken ? (
                  <IconButton
                    data-testid="provider-billing-access-token-remove"
                    className="settings-icon-button danger"
                    compactSquare
                    icon={<Icon name="trash" size={16} />}
                    tooltip={t.settings.removeSecret}
                    aria-label={t.settings.removeSecret}
                    onClick={() => onAccessTokenRemove?.()}
                  />
                ) : null}
              </div>
            </div>
            {accessTokenInputVisible ? (
              <TextField
                data-testid="provider-billing-access-token-input"
                id="provider-billing-access-token-input"
                type="password"
                className="field-input mono ui-field-control"
                placeholder={billing.hasSavedAccessToken && !billing.accessToken ? t.settings.accessTokenReplacePlaceholder : accessTokenPlaceholder}
                value={billing.accessToken}
                onValue={(value) => onBillingChange({ ...billing, accessToken: sanitizeProviderSecretValue(value) })}
              />
            ) : null}
            <HelpText
              data-testid={accessTokenRemovalPending ? 'provider-billing-access-token-removal-pending' : undefined}
              className="field-hint billing-settings-hint"
              variant={accessTokenRemovalPending || accessTokenError ? 'negative' : undefined}
            >
              {accessTokenRemovalPending
                ? t.settings.secretRemovalPending
                : accessTokenError ?? t.settings.billingAccessTokenHint}
            </HelpText>
          </div>
        </div>
      )}
    </div>
  );
}

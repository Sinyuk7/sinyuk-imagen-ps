import { useState, useEffect } from 'react';
import { FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { Icon } from './icons';
import { TextSelect } from './text-select';
import { useI18n } from '../i18n/i18n-context';
import { sanitizeBillingPath, sanitizeProviderSecretValue, type ProviderBillingDraft } from '../hooks/use-provider-settings';

type ProviderBillingUpdater = (billing: ProviderBillingDraft) => ProviderBillingDraft;

interface BillingModeOption {
  readonly id: ProviderBillingDraft['source'];
  readonly label: string;
}

interface ProviderBillingSettingsProps {
  readonly billing: ProviderBillingDraft;
  readonly onBillingChange: (updater: ProviderBillingUpdater) => void;
  readonly billingModeOptions: readonly BillingModeOption[];
  readonly modeMenuOpen: boolean;
  readonly onModeMenuOpenChange: (open: boolean) => void;
  readonly disabled?: boolean;
  readonly accessTokenPlaceholder?: string;
  readonly accessTokenSavedMeta?: string | null;
  readonly accessTokenRemovalPending?: boolean;
  readonly onAccessTokenRemove?: () => void;
  readonly sourceError?: string | null;
  readonly pathError?: string | null;
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
  sourceError = null,
  pathError = null,
  userIdError = null,
  accessTokenError = null,
}: ProviderBillingSettingsProps) {
  const { messages: t } = useI18n();
  const [accessTokenEditing, setAccessTokenEditing] = useState(false);
  const selectedModeLabel =
    billingModeOptions.find((option) => option.id === billing.source)?.label ?? billing.source;

  useEffect(() => {
    setAccessTokenEditing(!billing.hasSavedToken || billing.token.length > 0);
  }, [billing.hasSavedToken, billing.token.length]);

  const accessTokenInputVisible = accessTokenEditing || accessTokenRemovalPending || !billing.hasSavedToken;

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
          selectedId={billing.source}
          onSelect={(id) => onBillingChange((current) => ({
            ...current,
            source: id as ProviderBillingDraft['source'],
            ...((id as ProviderBillingDraft['source']) !== 'billing-token' ? { token: '', userId: '' } : {}),
            ...((id as ProviderBillingDraft['source']) === 'disabled' ? { path: '' } : {}),
          }))}
          testId="provider-billing-mode-selector"
          triggerId="provider-billing-mode-selector"
          containerClassName="cmp-select cmp-select-model provider-model-select"
          menuClassName="cmp-select-menu cmp-select-menu-model"
        />
        <HelpText className="field-hint billing-settings-hint" variant={sourceError ? 'negative' : undefined}>
          {sourceError ?? t.settings.billingModeHint}
        </HelpText>
      </div>
      {billing.source !== 'disabled' && (
        <div className="billing-settings-grid">
          <div className="field billing-settings-field">
            <FieldLabel htmlFor="provider-billing-path-input">{t.settings.billingPath}</FieldLabel>
            <TextField
              data-testid="provider-billing-path-input"
              id="provider-billing-path-input"
              className="field-input mono ui-field-control"
              placeholder="/client/openapi/getCredits"
              value={billing.path}
              disabled={disabled}
              onValue={(value) => onBillingChange((current) => ({ ...current, path: sanitizeBillingPath(value) }))}
            />
            <HelpText className="field-hint billing-settings-hint" variant={pathError ? 'negative' : undefined}>
              {pathError ?? t.settings.billingPathHint}
            </HelpText>
          </div>
          {billing.source === 'billing-token' ? (
            <>
              <div className="field billing-settings-field billing-settings-field-spaced">
                <FieldLabel htmlFor="provider-billing-user-id-input">{t.settings.billingUserId}</FieldLabel>
                <TextField
                  data-testid="provider-billing-user-id-input"
                  id="provider-billing-user-id-input"
                  className="field-input mono ui-field-control"
                  placeholder="10001"
                  value={billing.userId}
                  disabled={disabled}
                  onValue={(value) => onBillingChange((current) => ({ ...current, userId: sanitizeProviderSecretValue(value) }))}
                />
                <HelpText className="field-hint billing-settings-hint" variant={userIdError ? 'negative' : undefined}>
                  {userIdError ?? t.settings.billingUserIdHint}
                </HelpText>
              </div>
              <div className="field billing-settings-field billing-settings-field-spaced">
                <div className="settings-field-header">
                  <FieldLabel htmlFor="provider-billing-access-token-input">{t.settings.billingAccessToken}</FieldLabel>
                  <div className="settings-field-header-actions">
                    {billing.hasSavedToken && !accessTokenRemovalPending ? (
                      <span data-testid="provider-billing-access-token-saved-meta" className="settings-secret-meta-inline">
                        {accessTokenSavedMeta}
                      </span>
                    ) : null}
                    {!accessTokenInputVisible && billing.hasSavedToken ? (
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
                    {billing.hasSavedToken ? (
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
                    placeholder={billing.hasSavedToken && !billing.token ? t.settings.accessTokenReplacePlaceholder : accessTokenPlaceholder}
                    value={billing.token}
                    disabled={disabled}
                    onValue={(value) => onBillingChange((current) => ({ ...current, token: sanitizeProviderSecretValue(value) }))}
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
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

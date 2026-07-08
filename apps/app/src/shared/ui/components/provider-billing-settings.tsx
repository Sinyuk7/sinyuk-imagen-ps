import { useState, type ReactNode } from 'react';
import { FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { SecretField } from './secret-field';
import { TextSelect } from './text-select';
import { useI18n } from '../i18n/i18n-context';
import { sanitizeBillingPath, sanitizeProviderSecretValue, type ProviderBillingDraft } from '../hooks/use-provider-settings';

type ProviderBillingUpdater = (billing: ProviderBillingDraft) => ProviderBillingDraft;

const SAVED_SECRET_MASK = '••••••••••••••••';

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
  readonly accessTokenRemovalPending?: boolean;
  readonly onAccessTokenRemove?: () => void;
  readonly onAccessTokenRemovalPendingChange?: (pending: boolean) => void;
  readonly sourceError?: string | null;
  readonly pathError?: string | null;
  readonly userIdError?: string | null;
  readonly accessTokenError?: string | null;
  readonly footer?: ReactNode;
}

export function ProviderBillingSettings({
  billing,
  onBillingChange,
  billingModeOptions,
  modeMenuOpen,
  onModeMenuOpenChange,
  disabled = false,
  accessTokenPlaceholder = 'sk-...',
  accessTokenRemovalPending = false,
  onAccessTokenRemove,
  onAccessTokenRemovalPendingChange,
  sourceError = null,
  pathError = null,
  userIdError = null,
  accessTokenError = null,
  footer = null,
}: ProviderBillingSettingsProps) {
  const { messages: t } = useI18n();
  const [showAccessToken, setShowAccessToken] = useState(false);
  const selectedModeLabel =
    billingModeOptions.find((option) => option.id === billing.source)?.label ?? billing.source;
  const hasDraftAccessToken = billing.token.trim().length > 0;
  const hasSavedAccessToken = billing.hasSavedToken && !hasDraftAccessToken && !accessTokenRemovalPending;
  const accessTokenHelper = accessTokenRemovalPending
    ? t.settings.secretRemovalPending
    : accessTokenError ?? (hasSavedAccessToken ? t.settings.billingAccessTokenSavedHint : t.settings.billingAccessTokenHint);
  const accessTokenClearTooltip = hasDraftAccessToken ? t.settings.clearField : t.settings.removeSecret;
  const accessTokenPlaceholderValue = hasSavedAccessToken ? SAVED_SECRET_MASK : accessTokenPlaceholder;
  const showAccessTokenClear = hasDraftAccessToken || (billing.hasSavedToken && !accessTokenRemovalPending && typeof onAccessTokenRemove === 'function');

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
          containerClassName="cmp-select settings-select"
          menuClassName="cmp-select-menu cmp-select-menu-compact"
        />
        <HelpText className="field-hint billing-settings-hint" variant={sourceError ? 'negative' : undefined}>
          {sourceError ?? t.settings.billingModeHint}
        </HelpText>
      </div>
      {billing.source !== 'disabled' && (
        <div className="billing-settings-grid">
          <div className="field billing-settings-field">
            <FieldLabel htmlFor="provider-billing-path-input">{t.settings.billingPath}</FieldLabel>
            <div
              className="field-input-affordance field-input-shell"
              data-disabled={disabled ? 'true' : undefined}
              data-native-editor-suspended={modeMenuOpen ? 'true' : undefined}
            >
              <TextField
                data-testid="provider-billing-path-input"
                id="provider-billing-path-input"
                className="field-input mono ui-field-control field-input-embedded"
                placeholder="/client/openapi/getCredits"
                value={billing.path}
                disabled={disabled}
                nativeEditorSuspended={modeMenuOpen}
                onValue={(value) => onBillingChange((current) => ({ ...current, path: sanitizeBillingPath(value) }))}
              />
            </div>
            <HelpText className="field-hint billing-settings-hint" variant={pathError ? 'negative' : undefined}>
              {pathError ?? t.settings.billingPathHint}
            </HelpText>
          </div>
          {billing.source === 'billing-token' ? (
            <>
              <div className="field billing-settings-field">
                <FieldLabel htmlFor="provider-billing-user-id-input">{t.settings.billingUserId}</FieldLabel>
                <div
                  className="field-input-affordance field-input-shell"
                  data-disabled={disabled ? 'true' : undefined}
                  data-native-editor-suspended={modeMenuOpen ? 'true' : undefined}
                >
                  <TextField
                    data-testid="provider-billing-user-id-input"
                    id="provider-billing-user-id-input"
                    className="field-input mono ui-field-control field-input-embedded"
                    placeholder="10001"
                    value={billing.userId}
                    disabled={disabled}
                    nativeEditorSuspended={modeMenuOpen}
                    onValue={(value) => onBillingChange((current) => ({ ...current, userId: sanitizeProviderSecretValue(value) }))}
                  />
                </div>
                <HelpText className="field-hint billing-settings-hint" variant={userIdError ? 'negative' : undefined}>
                  {userIdError ?? t.settings.billingUserIdHint}
                </HelpText>
              </div>
              <SecretField
                label={t.settings.billingAccessToken}
                inputId="provider-billing-access-token-input"
                testIdPrefix="provider-billing-access-token"
                value={billing.token}
                placeholder={accessTokenPlaceholderValue}
                showValue={showAccessToken}
                onValue={(value) => {
                  const nextValue = sanitizeProviderSecretValue(value);
                  if (accessTokenRemovalPending && nextValue.length > 0) {
                    onAccessTokenRemovalPendingChange?.(false);
                  }
                  onBillingChange((current) => ({ ...current, token: nextValue }));
                }}
                onShowValueChange={setShowAccessToken}
                disabled={disabled}
                helperText={accessTokenHelper}
                helperTestId={accessTokenRemovalPending ? 'provider-billing-access-token-removal-pending' : undefined}
                helperClassName="billing-settings-hint"
                helperVariant={accessTokenRemovalPending || accessTokenError ? 'negative' : undefined}
                fieldClassName="billing-settings-field"
                shellClassName="field-input-shell"
                inputClassName={hasSavedAccessToken ? 'billing-secret-saved-input' : undefined}
                nativeEditorSuspended={modeMenuOpen}
                onClear={showAccessTokenClear
                  ? () => {
                      if (hasDraftAccessToken) {
                        onBillingChange((current) => ({ ...current, token: '' }));
                        return;
                      }
                      onAccessTokenRemove?.();
                    }
                  : undefined}
                clearPersistent={hasDraftAccessToken}
                clearTooltip={accessTokenClearTooltip}
              />
            </>
          ) : null}
        </div>
      )}
      {footer ? (
        <div className="billing-settings-footer">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

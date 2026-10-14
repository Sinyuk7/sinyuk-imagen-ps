import { useRef, useState } from 'react';
import { SecretField } from '../../../components/secret-field';
import { useI18n } from '../../../i18n/i18n-context';
import { Button, FieldGroup, FooterActions, SettingsFormSection, StatusNotice, TextField } from '../../../ui-system';

export interface ProfileFormValue {
  readonly displayName: string;
  readonly apiKey?: string;
  readonly removeSavedApiKey?: boolean;
  readonly billingToken?: string;
  readonly removeSavedBillingToken?: boolean;
}

interface ProfileFormProps {
  readonly initialDisplayName: string;
  readonly hasSavedApiKey: boolean;
  readonly enableBillingToken?: boolean;
  readonly hasSavedBillingToken?: boolean;
  readonly existingDisplayNames: readonly string[];
  readonly onCancel: () => void;
  readonly onSave: (value: ProfileFormValue) => Promise<void>;
  readonly onDelete?: () => Promise<void>;
  readonly onTest?: () => Promise<void>;
}

/** 只处理名称、API Key 与页面动作的窄共享表单。 */
export function ProfileForm({
  initialDisplayName,
  hasSavedApiKey,
  enableBillingToken = false,
  hasSavedBillingToken = false,
  existingDisplayNames,
  onSave,
  onDelete,
  onTest,
}: ProfileFormProps) {
  const { messages: t } = useI18n();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [removeSavedApiKey, setRemoveSavedApiKey] = useState(false);
  const [billingToken, setBillingToken] = useState('');
  const [showBillingToken, setShowBillingToken] = useState(false);
  const [removeSavedBillingToken, setRemoveSavedBillingToken] = useState(false);
  const [busyAction, setBusyAction] = useState<'save' | 'test' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const busyRef = useRef(false);
  const normalizedName = displayName.trim();
  const initialNormalizedName = initialDisplayName.trim();
  const duplicateName = existingDisplayNames.some((name) => name.trim() === normalizedName);
  const requiresApiKey = !hasSavedApiKey && !apiKey.trim();
  const isExistingProfile = Boolean(onDelete);
  const isDirty = normalizedName !== initialNormalizedName
    || Boolean(apiKey.trim())
    || removeSavedApiKey
    || Boolean(billingToken.trim())
    || removeSavedBillingToken;
  const saveDisabled = busyAction !== null
    || !normalizedName
    || duplicateName
    || requiresApiKey
    || (isExistingProfile && !isDirty);

  const run = async (action: 'save' | 'test' | 'delete', callback: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyAction(action);
    setError(null);
    try {
      await callback();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  };

  return (
    <>
      <SettingsFormSection testId="provider-profile-form">
        <FieldGroup label={t.settings.alias} htmlFor="provider-profile-name">
          <TextField
            id="provider-profile-name"
            data-testid="provider-profile-name-input"
            value={displayName}
            disabled={busyAction !== null}
            onValue={setDisplayName}
          />
          {duplicateName ? <StatusNotice tone="negative" message={t.settings.duplicateDisplayName(normalizedName)} /> : null}
        </FieldGroup>
        <SecretField
          label="API Key"
          inputId="provider-profile-api-key"
          testIdPrefix="provider-profile-api-key"
          value={apiKey}
          placeholder={hasSavedApiKey && !removeSavedApiKey ? t.settings.apiKeyReplacePlaceholder : 'sk-...'}
          showValue={showKey}
          onValue={(value) => {
            setApiKey(value);
            if (value) setRemoveSavedApiKey(false);
          }}
          onShowValueChange={setShowKey}
          disabled={busyAction !== null}
          removalPending={removeSavedApiKey}
          onClear={() => {
            if (apiKey) {
              setApiKey('');
              return;
            }
            if (hasSavedApiKey) setRemoveSavedApiKey(!removeSavedApiKey);
          }}
          clearPersistent={hasSavedApiKey}
          clearTooltip={apiKey ? t.settings.clearField : removeSavedApiKey ? t.common.cancel : t.settings.removeSecret}
        />
        {enableBillingToken ? (
          <SecretField
            label="Token"
            inputId="provider-profile-billing-token-input"
            testIdPrefix="provider-profile-billing-token"
            value={billingToken}
            placeholder={hasSavedBillingToken && !removeSavedBillingToken ? t.settings.apiKeyReplacePlaceholder : 'token'}
            showValue={showBillingToken}
            onValue={(value) => {
              setBillingToken(value);
              if (value) setRemoveSavedBillingToken(false);
            }}
            onShowValueChange={setShowBillingToken}
            disabled={busyAction !== null}
            removalPending={removeSavedBillingToken}
            onClear={() => {
              if (billingToken) {
                setBillingToken('');
                return;
              }
              if (hasSavedBillingToken) setRemoveSavedBillingToken(!removeSavedBillingToken);
            }}
            clearPersistent={hasSavedBillingToken}
            clearTooltip={billingToken ? t.settings.clearField : removeSavedBillingToken ? t.common.cancel : t.settings.removeSecret}
          />
        ) : null}
      </SettingsFormSection>

      {error ? <StatusNotice tone="negative" message={error} copyText={error} /> : null}

      {deleteConfirmation ? (
        <SettingsFormSection testId="provider-profile-delete-confirmation">
          <StatusNotice tone="warning" message={t.settings.deleteProfileConfirmation} />
          <FooterActions>
            <Button
              data-testid="provider-profile-cancel-delete"
              disabled={busyAction !== null}
              onClick={() => setDeleteConfirmation(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              data-testid="provider-profile-confirm-delete"
              variant="negative"
              disabled={busyAction !== null}
              onClick={() => void run('delete', async () => onDelete?.())}
            >
              {t.common.delete}
            </Button>
          </FooterActions>
        </SettingsFormSection>
      ) : (
        <FooterActions>
          {onDelete ? (
            <Button
              data-testid="provider-profile-delete-button"
              variant="negative"
              disabled={busyAction !== null}
              onClick={() => setDeleteConfirmation(true)}
            >
              {t.common.delete}
            </Button>
          ) : null}
          {onTest ? (
            <Button
              data-testid="provider-profile-test-button"
              disabled={busyAction !== null}
              onClick={() => void run('test', onTest)}
            >
              {busyAction === 'test' ? t.settings.testingConnection : t.settings.testConnection}
            </Button>
          ) : null}
          <Button
            data-testid="provider-profile-save-button"
            variant="accent"
            disabled={saveDisabled}
            onClick={() => void run('save', async () => onSave({
              displayName: normalizedName,
              ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
              ...(removeSavedApiKey ? { removeSavedApiKey: true } : {}),
              ...(billingToken.trim() ? { billingToken: billingToken.trim() } : {}),
              ...(removeSavedBillingToken ? { removeSavedBillingToken: true } : {}),
            }))}
          >
            {busyAction === 'save' ? t.settings.savingProvider : t.common.save}
          </Button>
        </FooterActions>
      )}
    </>
  );
}

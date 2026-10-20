import { useEffect, useState } from 'react';
import type { ProviderAccount } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import { useI18n } from '../i18n/i18n-context';
import { FieldGroup, Icon, IconButton, PageFrame, PageHeader, PageScroll, SecretField, SettingsFormSection, TextField, useToast } from '../ui-system';

interface ProviderAccountSettingsPageProps {
  readonly services: AppServices;
  readonly providerId: 'grsai' | 'runninghub';
  readonly accounts: readonly ProviderAccount[];
  readonly onBack: () => void;
  readonly onSaved: () => void;
}

const PROVIDERS = [
  { id: 'grsai' as const, label: 'GRSAI' },
  { id: 'runninghub' as const, label: 'RunningHub' },
];

/** 固定 provider 的单账号编辑页。 */
export function ProviderAccountSettingsPage({ services, providerId, accounts, onBack, onSaved }: ProviderAccountSettingsPageProps) {
  const { messages: t } = useI18n();
  const { show } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [tokens, setTokens] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValues(Object.fromEntries(PROVIDERS.map(({ id }) => [id, ''])));
    setBaseUrls(Object.fromEntries(PROVIDERS.map(({ id }) => [id, accounts.find((account) => account.providerId === id)?.baseUrl ?? ''])));
  }, [accounts]);
  useEffect(() => {
    setTokens('');
    setShowApiKey(false);
    setShowToken(false);
  }, [providerId]);
  const save = async () => {
    const apiKey = values[providerId]?.trim();
    const configured = accounts.some((account) => account.providerId === providerId);
    if (!apiKey && !configured) return;
    setBusy(true);
    try {
      const result = await services.commands.saveProviderAccount({ providerId, displayName: provider.label, ...(apiKey ? { apiKey } : {}), ...(providerId === 'grsai' && tokens.trim() ? { billingToken: tokens } : {}), baseUrl: baseUrls[providerId] || undefined });
      if (result.ok) {
        show(t.settings.saved, 'positive', { key: `provider-settings-saved:${providerId}` });
        onSaved();
      } else {
        show(`${t.settings.connectionFailed}: ${result.error.message}`, 'negative', { key: `provider-settings-save-failed:${providerId}` });
      }
    } catch (error) {
      show(`${t.settings.connectionFailed}: ${error instanceof Error ? error.message : String(error)}`, 'negative', { key: `provider-settings-save-failed:${providerId}` });
    } finally {
      setBusy(false);
    }
  };
  const provider = PROVIDERS.find((item) => item.id === providerId) ?? PROVIDERS[0];
  return (
    <PageFrame watch={`provider-account-settings:${providerId}`}>
      <PageHeader title={t.settings.providerAccountTitle} onBack={onBack} right={(
        <IconButton data-testid="provider-account-save" disabled={busy || (!(values[providerId]?.trim()) && !accounts.some((account) => account.providerId === providerId))} className="ui-page-header-action" icon={<Icon name="save" size={16} />} tooltip={busy ? t.settings.savingProvider : t.common.save} onClick={() => void save()} />
      )} />
      <PageScroll>
        {[provider].map(({ id }) => {
          const configured = accounts.some((account) => account.providerId === id);
          return (
            <SettingsFormSection key={id}>
              <SecretField label={t.settings.apiKeyLabel} inputId={`${id}-api-key`} testIdPrefix={`${id}-api-key`} value={values[id] ?? ''} placeholder={configured ? t.settings.apiKeyReplacePlaceholder : t.settings.apiKeyPlaceholder} showValue={showApiKey} onShowValueChange={setShowApiKey} onValue={(value) => setValues((current) => ({ ...current, [id]: value }))} />
              {id === 'grsai' ? <SecretField label={t.settings.billingToken} inputId="grsai-billing-token" testIdPrefix="grsai-billing-token" value={tokens} placeholder={t.settings.billingTokenPlaceholder} showValue={showToken} onShowValueChange={setShowToken} helperText={t.settings.billingTokenHint} onValue={setTokens} /> : null}
              <FieldGroup label={t.settings.baseUrlLabel} htmlFor="provider-base-url">
                <TextField id="provider-base-url" className="field-input mono" value={baseUrls[id] ?? ''} placeholder={t.settings.baseUrlPlaceholder} onValue={(value) => setBaseUrls((current) => ({ ...current, [id]: value }))} />
              </FieldGroup>
            </SettingsFormSection>
          );
        })}
      </PageScroll>
    </PageFrame>
  );
}

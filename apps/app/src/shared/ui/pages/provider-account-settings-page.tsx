import { useEffect, useState } from 'react';
import type { ProviderAccount } from '@imagen-ps/application';
import type { AppServices } from '../../ports/app-services';
import { Button, FieldGroup, PageFrame, PageHeader, PageScroll, TextField } from '../ui-system';

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
  const [values, setValues] = useState<Record<string, string>>({});
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValues(Object.fromEntries(PROVIDERS.map(({ id }) => [id, ''])));
    setBaseUrls(Object.fromEntries(PROVIDERS.map(({ id }) => [id, accounts.find((account) => account.providerId === id)?.baseUrl ?? ''])));
  }, [accounts]);
  const save = async (providerId: 'grsai' | 'runninghub', displayName: string) => {
    const apiKey = values[providerId]?.trim();
    if (!apiKey) return;
    setBusy(true);
    const result = await services.commands.saveProviderAccount({ providerId, displayName, apiKey, baseUrl: baseUrls[providerId] || undefined });
    setBusy(false);
    if (result.ok) onSaved();
  };
  const provider = PROVIDERS.find((item) => item.id === providerId) ?? PROVIDERS[0];
  return (
    <PageFrame watch={`provider-account-settings:${providerId}`}>
      <PageHeader title={`${provider.label} settings`} onBack={onBack} />
      <PageScroll>
        {[provider].map(({ id, label }) => {
          const configured = accounts.some((account) => account.providerId === id);
          return (
            <section key={id} className="settings-form-section">
              <FieldGroup label={`${label} API Key`}>
                <TextField value={values[id] ?? ''} type="password" placeholder={configured ? 'Update API Key' : 'Enter API Key'} onValue={(value) => setValues((current) => ({ ...current, [id]: value }))} />
              </FieldGroup>
              <FieldGroup label="Base URL">
                <TextField value={baseUrls[id] ?? ''} placeholder="Optional provider endpoint" onValue={(value) => setBaseUrls((current) => ({ ...current, [id]: value }))} />
              </FieldGroup>
              <Button disabled={busy || !(values[id]?.trim())} onClick={() => void save(id, label)}>Save {label}</Button>
            </section>
          );
        })}
      </PageScroll>
    </PageFrame>
  );
}

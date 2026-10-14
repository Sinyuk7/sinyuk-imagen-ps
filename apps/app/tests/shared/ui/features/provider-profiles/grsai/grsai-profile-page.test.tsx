import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrsaiProfilePage } from '../../../../../../src/shared/ui/features/provider-profiles/grsai/grsai-profile-page';
import { createFakeServices } from '../../../../../helpers/fakes';
import { fakeProfile, fakeProviderSurfaces } from '../../../../../helpers/fixtures/provider.fixtures';
import { TestAppProviders } from '../../../../../helpers/render-helpers';
import { changeInput, flush } from '../../../../../helpers/settings-detail-harness';

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('GrsaiProfilePage', () => {
  it('只提交 GRSAI identity、名称、API Key 与可选 Token', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices();
    const onSaved = vi.fn(async () => undefined);
    const surface = fakeProviderSurfaces[0]!;
    root = createRoot(container);
    await act(async () => root?.render(
      <TestAppProviders services={fake.services}>
        <GrsaiProfilePage surface={surface} existingDisplayNames={[]} onBack={vi.fn()} onSaved={onSaved} onDeleted={vi.fn()} />
      </TestAppProviders>,
    ));

    const key = container.querySelector<HTMLInputElement>('[data-testid="provider-profile-api-key-input"]')!;
    const token = container.querySelector<HTMLInputElement>('[data-testid="provider-profile-billing-token-input"]')!;
    await act(async () => changeInput(key, 'sk-grsai'));
    await act(async () => changeInput(token, 'account-token'));
    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-profile-save-button"]')?.click());
    await flush();

    expect(fake.spies.saveProviderSurfaceProfile).toHaveBeenCalledWith(expect.objectContaining({
      implementationId: 'grsai-generate',
      displayName: 'GRSAI',
      apiKey: 'sk-grsai',
      billingToken: 'account-token',
    }));
    expect(fake.spies.saveProviderSurfaceProfile.mock.calls[0]?.[0]).not.toHaveProperty('config');
    expect(container.querySelector('[data-testid="provider-profile-test-button"]')).toBeNull();
    expect(container.textContent).not.toContain('Endpoint');
    expect(container.textContent).not.toContain('Billing');
    expect(container.textContent).not.toContain('模型配置');
    expect(container.querySelector('[data-testid="grsai-billing-section"]')).toBeNull();
  });

  it('编辑已有 Profile 时展示余额并允许刷新', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices();
    const profile = { ...fakeProfile, apiFormat: 'grsai' as const, profileId: 'grsai-edit', secretRefs: { apiKey: 'key-ref', billingToken: 'token-ref' } };
    root = createRoot(container);
    await act(async () => root?.render(
      <TestAppProviders services={fake.services}>
        <GrsaiProfilePage surface={fakeProviderSurfaces[0]!} profile={profile} existingDisplayNames={[]} onBack={vi.fn()} onSaved={vi.fn(async () => undefined)} onDeleted={vi.fn()} />
      </TestAppProviders>,
    ));
    await flush();
    expect(container.querySelector('[data-testid="grsai-billing-value"]')?.textContent).toContain('credits');
    await act(async () => container.querySelector<HTMLElement>('[data-testid="grsai-billing-refresh"]')?.click());
    await flush();
    expect(fake.spies.refreshProfileBalance).toHaveBeenCalledWith({ profileId: 'grsai-edit' });
  });
});

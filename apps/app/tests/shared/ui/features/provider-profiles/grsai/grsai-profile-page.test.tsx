import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrsaiProfilePage } from '../../../../../../src/shared/ui/features/provider-profiles/grsai/grsai-profile-page';
import { createFakeServices } from '../../../../../helpers/fakes';
import { fakeProviderSurfaces } from '../../../../../helpers/fixtures/provider.fixtures';
import { TestAppProviders } from '../../../../../helpers/render-helpers';
import { changeInput, flush } from '../../../../../helpers/settings-detail-harness';

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('GrsaiProfilePage', () => {
  it('只提交 GRSAI identity、名称与 API Key', async () => {
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
    await act(async () => changeInput(key, 'sk-grsai'));
    await act(async () => container.querySelector<HTMLElement>('[data-testid="provider-profile-save-button"]')?.click());
    await flush();

    expect(fake.spies.saveProviderSurfaceProfile).toHaveBeenCalledWith(expect.objectContaining({
      implementationId: 'grsai-generate',
      displayName: 'GRSAI',
      apiKey: 'sk-grsai',
    }));
    expect(fake.spies.saveProviderSurfaceProfile.mock.calls[0]?.[0]).not.toHaveProperty('config');
    expect(container.querySelector('[data-testid="provider-profile-test-button"]')).toBeNull();
    expect(container.textContent).not.toContain('Endpoint');
    expect(container.textContent).not.toContain('Billing');
    expect(container.textContent).not.toContain('模型配置');
  });
});

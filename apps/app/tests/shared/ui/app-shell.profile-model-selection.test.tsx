import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServices, fakeProfile, profileModelItem } from '../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../helpers/main-page-harness';

afterEach(async () => {
  await cleanupMainPageRoot();
  document.body.innerHTML = '';
});

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

function selectedId(container: HTMLElement, testId: string): string | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.getAttribute('data-selected-id') ?? null;
}

function createReturningUserServices(options?: Parameters<typeof createFakeServices>[0]) {
  return createFakeServices({
    ...options,
    generationSettings: {
      settingsOnboardingSeenVersion: 1,
      ...options?.generationSettings,
    },
  });
}

describe('AppShell profile-owned model flow', () => {
  it('settings root no longer exposes a standalone global model configuration row', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices();
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="model-configuration-row"]')).toBeNull();
    expect(container.querySelector(`[data-testid="provider-row-${fakeProfile.profileId}"]`)).not.toBeNull();
  });

  it('opens ProfileModelsPage from Profile Detail model selector action', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      profileModelItems: [profileModelItem('owned-model', { default: true, selected: true })],
    });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>(`[data-testid="provider-row-${fakeProfile.profileId}"]`)?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-default-model-selector"]')?.click();
    });
    await flush();

    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="provider-default-model-selector-option-__add-model__"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="profile-models-add-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="profile-model-row-owned-model"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).toBeNull();
  });

  it('creates and backs out through ProfileModelsPage instead of Profile Detail editor shortcuts', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({ profileModelItems: [] });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>(`[data-testid="provider-row-${fakeProfile.profileId}"]`)?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-default-model-selector"]')?.click();
    });
    await flush();

    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="provider-default-model-selector-option-__add-model__"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="profile-models-add-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-configuration-back-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="profile-models-add-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-default-model-selector"]')).toBeNull();
  });

  it('SettingsAddPage creates only profiles and has no model configuration shortcut', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices();
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="providers-add-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="provider-endpoint-detect-input"]')!, 'https://api.openai.com/v1/images/generations');
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="provider-add-model-config-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="provider-default-model-selector"]')).toBeNull();
    expect(container.querySelector('[data-testid="provider-save-button"]')).not.toBeNull();
  });

  it('keeps main model selector empty when active profile has no default model', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      activeImageProfileId: fakeProfile.profileId,
      profiles: [{ ...fakeProfile, defaultModelId: '' }],
      profileModelItems: [
        profileModelItem('owned-model', {
          default: false,
          selected: false,
          configSource: 'user',
        }),
      ],
    });
    await renderMainPage(container, services);
    await flush();
    await flush();

    expect(selectedId(container, 'main-model-selector')).toBe('');
  });

  it('settings provider rows show saved config model ids for user-configured defaults', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      profiles: [{
        ...fakeProfile,
        defaultModelId: 'nano-banana-fast',
      }],
      profileModelItems: [
        profileModelItem('nano-banana-fast', {
          displayName: 'Nano Banana 2 Lite',
          wireModelId: 'nano-banana-fast-wire',
          configSource: 'user',
          default: true,
          selected: true,
        }),
      ],
    });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await flush();

    const row = container.querySelector<HTMLElement>(`[data-testid="provider-row-${fakeProfile.profileId}"]`);
    expect(row?.textContent).toContain('nano-banana-fast');
    expect(row?.textContent).not.toContain('Nano Banana 2 Lite');
    expect(row?.textContent).not.toContain('nano-banana-fast-wire');
  });
});

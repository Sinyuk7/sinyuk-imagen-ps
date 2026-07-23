import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProviderProfile } from '@imagen-ps/application';
import { createFakeServices, fakeProfile } from '../../helpers/fakes';
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

async function click(container: ParentNode, testId: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click();
  });
  await flush();
  await flush();
}

async function enterProviderAdd(container: HTMLElement): Promise<void> {
  await click(container, 'main-providers-button');
  await click(container, 'providers-add-button');
  await act(async () => {
    changeInput(
      container.querySelector<HTMLInputElement>('[data-testid="provider-endpoint-detect-input"]')!,
      'https://relay.test/v1/images/generations',
    );
  });
  await flush();
  await flush();
}

function expectCompletedOnProviderRoot(container: HTMLElement, profile: ProviderProfile): void {
  expect(container.querySelector('[data-testid="provider-output-settings-row"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="provider-endpoint-detect-input"]')).toBeNull();
  expect(container.querySelector('[data-testid="provider-model-selector"]')).toBeNull();
  expect(container.querySelector('[data-testid="model-config-save-button"]')).toBeNull();

  const row = container.querySelector<HTMLElement>(`[data-testid="provider-row-${profile.profileId}"]`);
  const createdIndicator = row?.querySelector<HTMLElement>('[data-profile-created="true"]');
  expect(row).not.toBeNull();
  expect(createdIndicator?.classList.contains('ready')).toBe(true);
  expect(createdIndicator?.getAttribute('role')).toBe('status');
  expect(createdIndicator?.getAttribute('aria-label')).toContain(profile.displayName);
  expect(document.body.querySelector('[data-testid="toast"]')?.textContent).toContain(profile.displayName);
}

describe('AppShell Profile setup completion', () => {
  it('returns a directly ready Profile to provider root and preserves an existing active Profile', async () => {
    const created: ProviderProfile = {
      ...fakeProfile,
      profileId: 'created-ready-profile',
      displayName: 'Created Ready Profile',
      config: { ...fakeProfile.config, displayName: 'Created Ready Profile' },
    };
    const fake = createFakeServices({
      profiles: [fakeProfile],
      activeImageProfileId: fakeProfile.profileId,
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, fake);
    await enterProviderAdd(container);

    fake.spies.continueProviderProfileSetup.mockResolvedValue({
      ok: true,
      value: { kind: 'ready', profile: created },
    });
    fake.spies.listProviderProfiles.mockResolvedValue({ ok: true, value: [fakeProfile, created] });

    await click(container, 'provider-save-button');
    await flush();

    expectCompletedOnProviderRoot(container, created);
    await expect(fake.services.activeImageProfile.load()).resolves.toBe(fakeProfile.profileId);
  });

  it('returns first Model Configuration promotion to provider root and activates the first Profile', async () => {
    const fake = createFakeServices({ profiles: [], activeImageProfileId: null });
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, fake);
    await enterProviderAdd(container);

    await click(container, 'provider-save-button');
    expect(container.querySelector('[data-testid="profile-models-add-button"]')).not.toBeNull();

    const setupInput = fake.spies.continueProviderProfileSetup.mock.calls[0]?.[0].profile;
    expect(setupInput).toBeDefined();
    const promoted: ProviderProfile = {
      ...fakeProfile,
      profileId: setupInput!.profileId,
      apiFormat: setupInput!.apiFormat!,
      displayName: setupInput!.displayName!,
      lifecycle: 'ready',
      config: setupInput!.config!,
    };
    fake.spies.getProviderProfile.mockResolvedValue({ ok: true, value: promoted });
    fake.spies.listProviderProfiles.mockResolvedValue({ ok: true, value: [promoted] });

    await click(container, 'profile-models-add-button');
    expect(container.querySelector('[data-testid="model-config-save-button"]')).not.toBeNull();
    await click(container, 'model-config-save-button');
    await flush();
    await flush();

    expectCompletedOnProviderRoot(container, promoted);
    await expect(fake.services.activeImageProfile.load()).resolves.toBe(promoted.profileId);
  });
});

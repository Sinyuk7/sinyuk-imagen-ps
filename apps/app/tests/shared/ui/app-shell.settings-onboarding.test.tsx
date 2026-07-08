import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServices } from '../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../helpers/main-page-harness';

async function openSettings(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
  });
  await flush();
  await flush();
  await flush();
}

describe('AppShell settings onboarding flow', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('redirects first-time settings entry to onboarding and marks the guide seen', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices();
    await renderMainPage(container, fake);

    await openSettings(container);

    expect(container.querySelector('[data-testid="settings-onboarding-page"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="providers-help-button"]')).toBeNull();
    expect((await fake.services.generationSettings.load()).settingsOnboardingSeenVersion).toBe(1);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="settings-onboarding-back-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="settings-onboarding-page"]')).toBeNull();
    expect(container.querySelector('[data-testid="providers-help-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="providers-refresh-button"]')).toBeNull();
  });

  it('does not auto-redirect seen users and reopens onboarding from the help button', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      generationSettings: { settingsOnboardingSeenVersion: 1 },
    });
    await renderMainPage(container, fake);

    await openSettings(container);

    expect(container.querySelector('[data-testid="settings-onboarding-page"]')).toBeNull();
    expect(container.querySelector('[data-testid="providers-help-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="providers-refresh-button"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="providers-help-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="settings-onboarding-page"]')).not.toBeNull();
    expect((await fake.services.generationSettings.load()).settingsOnboardingSeenVersion).toBe(1);
  });

  it('reloads provider profiles each time settings is entered', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      generationSettings: { settingsOnboardingSeenVersion: 1 },
    });
    await renderMainPage(container, fake);

    const initialCalls = fake.spies.listProviderProfiles.mock.calls.length;

    await openSettings(container);
    expect(fake.spies.listProviderProfiles.mock.calls.length).toBe(initialCalls + 1);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="providers-back-button"]')?.click();
    });
    await flush();
    await flush();

    await openSettings(container);
    expect(fake.spies.listProviderProfiles.mock.calls.length).toBe(initialCalls + 2);
  });
});

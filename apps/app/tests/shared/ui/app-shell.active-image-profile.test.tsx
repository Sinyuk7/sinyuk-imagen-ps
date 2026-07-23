import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createFakeServices, fakeProfile } from '../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../helpers/main-page-harness';

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolveFn!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolveFn = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      resolveFn(value);
    },
  };
}

async function selectMainProfile(container: HTMLElement, profileId: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')?.click();
  });
  await flush();
  await act(async () => {
    document.body.querySelector<HTMLElement>(`[data-testid="profile-menu-option-${profileId}"]`)?.click();
  });
  await flush();
}

const secondaryProfile = {
  ...fakeProfile,
  profileId: 'backup-profile',
  displayName: 'Backup Profile',
  config: {
    ...fakeProfile.config,
    displayName: 'Backup Profile',
  },
  secretRefs: {
    apiKey: 'secret:provider-profile:backup-profile:apiKey',
  },
};

describe('AppShell active image profile restore', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('keeps a valid persisted selection while provider profiles are still loading', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const profiles = [fakeProfile, secondaryProfile] as const;
    const fake = createFakeServices({
      profiles,
      activeImageProfileId: secondaryProfile.profileId,
    });
    const profilesReady = createDeferred<void>();
    fake.spies.listProviderProfiles.mockImplementationOnce(async () => {
      await profilesReady.promise;
      return { ok: true as const, value: profiles };
    });
    const saveSpy = vi.spyOn(fake.services.activeImageProfile, 'save');

    await renderMainPage(container, fake);

    expect(saveSpy).not.toHaveBeenCalled();

    profilesReady.resolve(undefined);
    await flush();
    await flush();
    await flush();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="main-profile-selector"]')?.textContent).toContain('Backup Profile');
  });

  it('falls back to first profile only after provider profiles finish loading', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const profiles = [fakeProfile, secondaryProfile] as const;
    const fake = createFakeServices({
      profiles,
      activeImageProfileId: 'missing-profile',
    });
    const profilesReady = createDeferred<void>();
    fake.spies.listProviderProfiles.mockImplementationOnce(async () => {
      await profilesReady.promise;
      return { ok: true as const, value: profiles };
    });
    const saveSpy = vi.spyOn(fake.services.activeImageProfile, 'save');

    await renderMainPage(container, fake);

    expect(saveSpy).not.toHaveBeenCalled();

    profilesReady.resolve(undefined);
    await flush();
    await flush();
    await flush();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith(fakeProfile.profileId);
    expect(container.querySelector('[data-testid="main-profile-selector"]')?.textContent).toContain(fakeProfile.displayName);
  });

  it('keeps the main profile selector as an expandable control', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    await renderMainPage(container, createFakeServices());

    const selector = container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]');
    expect(selector?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(selector?.getAttribute('aria-expanded')).toBe('false');
    expect(Array.from(selector?.children ?? []).map((child) => child.className)).toEqual([
      'ui-icon-button-label',
      'ui-icon-button-icon-slot',
    ]);
    expect(selector?.parentElement?.querySelector('[data-icon-name="chevron-down"]')).not.toBeNull();
  });

  it('persists latest profile selection after an earlier write completes late', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      profiles: [fakeProfile, secondaryProfile],
      activeImageProfileId: fakeProfile.profileId,
    });
    const firstWrite = createDeferred<void>();
    let persistedProfileId: string | null = fakeProfile.profileId;
    let delayed = true;
    vi.spyOn(fake.services.activeImageProfile, 'save').mockImplementation(async (profileId) => {
      if (profileId === secondaryProfile.profileId && delayed) {
        delayed = false;
        await firstWrite.promise;
      }
      persistedProfileId = profileId;
    });

    await renderMainPage(container, fake);
    await selectMainProfile(container, secondaryProfile.profileId);
    await selectMainProfile(container, fakeProfile.profileId);
    firstWrite.resolve(undefined);
    await flush();
    await flush();

    expect(persistedProfileId).toBe(fakeProfile.profileId);
    expect(container.querySelector('[data-testid="main-profile-selector"]')?.textContent).toContain(fakeProfile.displayName);
  });

  it('does not let a late hydration result overwrite a user selection', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      profiles: [fakeProfile, secondaryProfile],
      activeImageProfileId: fakeProfile.profileId,
    });
    const load = createDeferred<string | null>();
    vi.spyOn(fake.services.activeImageProfile, 'load').mockImplementationOnce(() => load.promise);

    await renderMainPage(container, fake);
    await selectMainProfile(container, secondaryProfile.profileId);
    load.resolve(fakeProfile.profileId);
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="main-profile-selector"]')?.textContent).toContain(secondaryProfile.displayName);
  });
});

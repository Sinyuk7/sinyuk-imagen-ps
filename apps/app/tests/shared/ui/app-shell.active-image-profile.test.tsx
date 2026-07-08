import { afterEach, describe, expect, it, vi } from 'vitest';
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
});

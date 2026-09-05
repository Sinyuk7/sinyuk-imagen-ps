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

async function pressKey(element: HTMLElement, key: string): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
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
    expect(selector?.getAttribute('aria-controls')).toBe('main-profile-menu');
    expect(Array.from(selector?.children ?? []).map((child) => child.className)).toEqual([
      'ui-icon-button-label',
      'ui-icon-button-icon-slot',
    ]);
    expect(selector?.parentElement?.querySelector('[data-icon-name="chevron-down"]')).not.toBeNull();
  });

  it('uses one highlighted option without a duplicate check icon', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    await renderMainPage(container, createFakeServices({ profiles: [fakeProfile, secondaryProfile] }));
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')?.click();
    });
    await flush();

    const listbox = container.querySelector<HTMLElement>('#main-profile-menu');
    const selected = container.querySelector<HTMLElement>(`[data-testid="profile-menu-option-${fakeProfile.profileId}"]`);
    const unselected = container.querySelector<HTMLElement>(`[data-testid="profile-menu-option-${secondaryProfile.profileId}"]`);
    const comfyUi = container.querySelector<HTMLElement>('[data-testid="main-mode-comfyui"]');
    expect(listbox?.getAttribute('role')).toBe('listbox');
    expect(selected?.getAttribute('role')).toBe('option');
    expect(selected?.getAttribute('aria-selected')).toBe('true');
    expect(selected?.classList.contains('act')).toBe(true);
    expect(selected?.querySelector('[data-icon-name="check"]')).toBeNull();
    expect(unselected?.getAttribute('aria-selected')).toBe('false');
    expect(unselected?.classList.contains('act')).toBe(false);
    expect(comfyUi?.getAttribute('role')).toBe('option');
    expect(comfyUi?.getAttribute('aria-selected')).toBe('false');
    expect(document.activeElement).toBe(selected);
  });

  it('supports keyboard opening, roving focus, activation, and Escape focus restore', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    await renderMainPage(container, createFakeServices({ profiles: [fakeProfile, secondaryProfile] }));
    const selector = container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')!;

    await pressKey(selector, 'ArrowDown');
    const first = container.querySelector<HTMLElement>(`[data-testid="profile-menu-option-${fakeProfile.profileId}"]`)!;
    const second = container.querySelector<HTMLElement>(`[data-testid="profile-menu-option-${secondaryProfile.profileId}"]`)!;
    expect(selector.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(first);

    await pressKey(first, 'ArrowDown');
    expect(document.activeElement).toBe(second);
    await pressKey(second, ' ');
    expect(selector.getAttribute('aria-expanded')).toBe('false');
    expect(selector.textContent).toContain(secondaryProfile.displayName);
    expect(document.activeElement).toBe(selector);

    await pressKey(selector, 'Enter');
    expect(document.activeElement?.getAttribute('data-testid')).toBe(`profile-menu-option-${secondaryProfile.profileId}`);
    await pressKey(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('main-mode-comfyui');
    await pressKey(document.activeElement as HTMLElement, 'Enter');
    expect(selector.getAttribute('aria-expanded')).toBe('false');
    expect(selector.textContent).toContain('ComfyUI');
    expect(document.activeElement).toBe(selector);

    await pressKey(selector, 'Enter');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('main-mode-provider');
    await pressKey(document.activeElement as HTMLElement, 'Escape');
    expect(selector.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(selector);
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

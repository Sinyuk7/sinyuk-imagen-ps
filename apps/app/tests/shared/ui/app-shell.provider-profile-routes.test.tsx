import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServices } from '../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../helpers/main-page-harness';
import { changeInput } from '../../helpers/settings-detail-harness';

async function click(container: ParentNode, testId: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click();
  });
  await flush();
  await flush();
}

async function openProviderPicker(container: HTMLElement): Promise<void> {
  await click(container, 'main-providers-button');
  await click(container, 'providers-add-button');
}

describe('AppShell provider profile routes', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it.each([
    ['grsai', 'GRSAI'],
    ['gemini', 'Gemini'],
    ['openai-images', 'GPT Image 2'],
  ] as const)('routes picker selection %s to its dedicated create page', async (surfaceId, title) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({ profiles: [] }));

    await openProviderPicker(container);

    expect(container.querySelectorAll('[data-testid^="provider-picker-"]:not([data-testid$="back-button"])')).toHaveLength(3);
    expect(container.textContent).not.toContain('API Format');
    expect(container.textContent).not.toContain('OpenAI Chat');

    await click(container, `provider-picker-${surfaceId}`);

    expect(container.querySelector('.ui-page-header h1')?.textContent).toBe(title);
    expect(container.querySelector('[data-testid="provider-profile-form"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="profile-models-page"]')).toBeNull();
    expect(container.querySelector('[data-testid="model-configuration-page"]')).toBeNull();
  });

  it('creates, edits, and deletes a Gemini profile while returning to the provider list', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ profiles: [] });
    await renderMainPage(container, fake);

    await openProviderPicker(container);
    await click(container, 'provider-picker-gemini');

    const apiKey = container.querySelector<HTMLInputElement>('[data-testid="provider-profile-api-key-input"]')!;
    await act(async () => changeInput(apiKey, 'sk-gemini'));
    await flush();
    await click(container, 'provider-profile-save-button');

    const createInput = fake.spies.saveProviderSurfaceProfile.mock.lastCall?.[0];
    expect(createInput).toMatchObject({
      implementationId: 'gemini-generate-content',
      displayName: 'Gemini',
      apiKey: 'sk-gemini',
    });
    const profileId = createInput?.profileId;
    expect(profileId).toBeTruthy();
    expect(container.querySelector('[data-testid="providers-add-button"]')).not.toBeNull();
    expect(container.querySelector(`[data-testid="provider-row-${profileId}"]`)).not.toBeNull();

    await click(container, `provider-row-${profileId}`);
    const name = container.querySelector<HTMLInputElement>('[data-testid="provider-profile-name-input"]')!;
    await act(async () => changeInput(name, 'Gemini Work'));
    await flush();
    await click(container, 'provider-profile-save-button');

    expect(fake.spies.saveProviderSurfaceProfile.mock.lastCall?.[0]).toMatchObject({
      implementationId: 'gemini-generate-content',
      profileId,
      displayName: 'Gemini Work',
    });
    expect(container.querySelector(`[data-testid="provider-row-${profileId}"]`)?.textContent).toContain('Gemini Work');

    await click(container, `provider-row-${profileId}`);
    await click(container, 'provider-profile-delete-button');
    await click(container, 'provider-profile-confirm-delete');

    expect(fake.spies.deleteProviderProfile).toHaveBeenCalledWith(profileId);
    expect(container.querySelector('[data-testid="provider-empty-state"]')).not.toBeNull();
  });
});

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../../helpers/main-page-harness';
import {
  createFakeServices,
  fakeProfile,
  profileModelItem,
} from '../../../helpers/fakes';
import { createGenerationSettingsHarness } from '../../../helpers/harness/create-generation-settings-harness';

function optionIds(testId: string): readonly string[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid^="${testId}-option-"]`))
    .map((element) => element.dataset.testid?.slice(`${testId}-option-`.length) ?? '');
}

function hostContainsIcon(container: HTMLElement, testId: string, iconName: string): boolean {
  const trigger = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const host = trigger?.closest('.ui-overlay-icon-host');
  return host?.querySelector(`[data-icon-name="${iconName}"]`) !== null;
}

async function openSelect(container: HTMLElement, testId: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click();
  });
  await flush();
}

async function renderReadyMain(container: HTMLElement) {
  const fake = createFakeServices({
    activeImageProfileId: 'mock-profile',
    generationSettings: { settingsOnboardingSeenVersion: 1 },
  });
  await renderMainPage(container, fake);
  await flush();
  await flush();
  return fake;
}

function ratioModelOptions() {
  return {
    activeImageProfileId: 'mock-profile',
    profiles: [{
      ...fakeProfile,
      apiFormat: 'openai-chat-completions',
      config: {
        ...fakeProfile.config,
        apiFormat: 'openai-chat-completions',
      },
    }],
    profileModelItems: [profileModelItem('gemini-3-pro-image')],
  } as const;
}

describe('generation settings UI archetypes', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('renders GPT flexible-pixels controls on MainPage without aspect ratio in text-to-image', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderReadyMain(container);

    expect(container.querySelector('[data-testid="composer-output-size-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="composer-output-format-selector"]')).toBeNull();
    expect(container.querySelector('[data-testid="composer-output-ratio-selector"]')).toBeNull();

    await openSelect(container, 'composer-output-size-selector');
    expect(optionIds('composer-output-size-selector')).toEqual(['auto', '1k', '2k', '4k']);
  });

  it('prepends Use Input Size on MainPage for image edit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderReadyMain(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')?.click();
    });
    await flush();
    await flush();

    await openSelect(container, 'composer-output-size-selector');
    expect(optionIds('composer-output-size-selector')).toEqual(['use-input-size', 'auto', '1k', '2k', '4k']);
  });

  it('uses dedicated capture, size, and aspect-ratio icons on MainPage', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const harness = await createGenerationSettingsHarness(container, ratioModelOptions());

    await harness.selectModel('gemini-3-pro-image');

    expect(hostContainsIcon(container, 'composer-capture-button', 'capture-selection')).toBe(true);
    expect(hostContainsIcon(container, 'composer-output-size-selector', 'image-size')).toBe(true);
    expect(hostContainsIcon(container, 'composer-output-ratio-selector', 'aspect-ratio')).toBe(true);
  });

  it('uses same archetype rules on GlobalGenerationSettingsPage', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderReadyMain(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-generation-settings-row"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="global-output-size-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="global-output-format-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="global-aspect-ratio-selector"]')).toBeNull();

    await openSelect(container, 'global-output-size-selector');
    expect(optionIds('global-output-size-selector')).toEqual(['auto', '1k', '2k', '4k']);
    expect(container.querySelector('[data-testid="global-settings-provider-input-size-hint"]')?.textContent)
      .toContain('Use Input Size 会跟随首图。');
  });

  it('keeps main-page size and aspect ratio selection in sync with GlobalGenerationSettingsPage and submit payload', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const harness = await createGenerationSettingsHarness(container, ratioModelOptions());

    await harness.selectModel('gemini-3-pro-image');
    await harness.selectMainSize('2k');
    await harness.selectMainRatio('16:9');

    expect(harness.readMainSelection()).toEqual({
      imageSize: '2k',
      ratio: '16:9',
    });
    expect(harness.lastSavedPreference()).toMatchObject({
      modelId: 'gemini-3-pro-image',
      operation: 'text_to_image',
      selection: {
        geometry: { kind: 'ratio-resolution', resolution: '2k', aspectRatio: '16:9' },
        outputFormat: 'png',
      },
    });

    await harness.openGlobalSettings();
    expect(harness.readGlobalSelection()).toEqual({
      imageSize: '2k',
      ratio: '16:9',
      outputFormat: 'png',
    });

    await harness.backToMainFromGlobalSettings();
    await harness.send('roundtrip from main');

    expect(harness.lastSubmittedSelection()).toEqual({
      geometry: { kind: 'ratio-resolution', resolution: '2k', aspectRatio: '16:9' },
      outputFormat: 'png',
    });
  });

  it('keeps GlobalGenerationSettingsPage size and aspect ratio selection in sync with main page and submit payload', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const harness = await createGenerationSettingsHarness(container, ratioModelOptions());

    await harness.selectModel('gemini-3-pro-image');
    await harness.openGlobalSettings();
    await harness.selectGlobalSize('2k');
    await harness.selectGlobalRatio('16:9');

    expect(harness.readGlobalSelection()).toEqual({
      imageSize: '2k',
      ratio: '16:9',
      outputFormat: 'png',
    });
    expect(harness.lastSavedPreference()).toMatchObject({
      modelId: 'gemini-3-pro-image',
      operation: 'text_to_image',
      selection: {
        geometry: { kind: 'ratio-resolution', resolution: '2k', aspectRatio: '16:9' },
        outputFormat: 'png',
      },
    });

    await harness.backToMainFromGlobalSettings();
    expect(harness.readMainSelection()).toEqual({
      imageSize: '2k',
      ratio: '16:9',
    });

    await harness.send('roundtrip from settings');
    expect(harness.lastSubmittedSelection()).toEqual({
      geometry: { kind: 'ratio-resolution', resolution: '2k', aspectRatio: '16:9' },
      outputFormat: 'png',
    });
  });

  it('applies GlobalGenerationSettingsPage output format selection to persisted state and submit payload', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const harness = await createGenerationSettingsHarness(container, { activeImageProfileId: 'mock-profile' });

    await harness.openGlobalSettings();
    await harness.selectGlobalSize('4k');
    await harness.selectGlobalFormat('webp');

    expect(harness.readGlobalSelection()).toEqual({
      imageSize: '4k',
      ratio: null,
      outputFormat: 'webp',
    });
    expect(harness.lastSavedPreference()).toMatchObject({
      modelId: 'gpt-image-2',
      operation: 'text_to_image',
      selection: {
        geometry: { kind: 'pixels', width: 3840, height: 3840 },
        outputFormat: 'webp',
      },
    });

    await harness.backToMainFromGlobalSettings();
    expect(harness.readMainSelection()).toEqual({
      imageSize: '4k',
      ratio: null,
    });

    await harness.send('format from settings');
    expect(harness.lastSubmittedSelection()).toEqual({
      geometry: { kind: 'pixels', width: 3840, height: 3840 },
      outputFormat: 'webp',
    });
  });
});

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { UserModelConfig } from '@imagen-ps/application';
import { createFakeServices, fakeProfile, profileModelItem } from '../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage, sendPrompt } from '../../helpers/main-page-harness';

const simpleFlexibleExposure = {
  kind: 'flexible-pixels' as const,
  sizePresetIds: ['auto', '1k'],
  outputFormats: ['png'],
  allowInputDerivedExactSize: false,
};

const providerModelConfigs: readonly UserModelConfig[] = [
  {
    apiFormat: 'openai-images',
    modelId: 'user-only-model',
    baseModelId: 'gpt-image-2',
    wireModelId: 'user-only-model-vip',
    requestStrategyId: 'image-endpoint-default',
    outputExposure: simpleFlexibleExposure,
    outputMatrix: [],
  },
  {
    apiFormat: 'openai-chat-completions',
    modelId: 'wrong-format-model',
    baseModelId: 'gpt-4o-image',
    wireModelId: 'wrong-format-model',
    requestStrategyId: 'chat-image-default',
    outputExposure: {
      kind: 'ratio-resolution',
      aspectRatios: ['1:1'],
      resolutions: ['1k'],
      outputFormats: ['png'],
    },
    outputMatrix: [],
  },
];

afterEach(async () => {
  await cleanupMainPageRoot();
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

describe('AppShell profile model selection flow', () => {
  it('settings page provider rows show readable default model labels', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      profiles: [fakeProfile],
      profileModelItems: [
        profileModelItem('gpt-image-2', {
          displayName: 'GPT Image 2',
          default: true,
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
    expect(row?.textContent).toContain('GPT Image 2');
    expect(row?.textContent).not.toContain('gpt-image-2');
  });

  it('settings page provider rows show saved config model ids for user-configured defaults', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      profiles: [{
        ...fakeProfile,
        defaultModelId: 'nano-banana-fast',
        selectedModelIds: ['nano-banana-fast'],
      }],
      profileModelItems: [
        profileModelItem('nano-banana-fast', {
          displayName: 'Nano Banana 2 Lite',
          wireModelId: 'nano-banana-fast-wire',
          configSource: 'user',
          default: true,
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

  it('opens model configuration list from settings page instead of create editor', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({ userModelConfigs: [] });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-configuration-row"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="model-configuration-add-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-model-id"]')).toBeNull();
    expect(container.querySelector('[data-testid="model-configuration-title"]')).not.toBeNull();
  });

  it('returns to main page when backing out of profile detail opened from result card avatar', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({ activeImageProfileId: 'mock-profile' });
    await renderMainPage(container, services);
    await flush();
    await flush();

    await sendPrompt(container, 'Generate square preview and explain result.');
    await flush();
    await flush();

    const mediaCardHeader = container.querySelector<HTMLElement>('[data-testid$="-header"][data-testid^="result-media-card-"]');
    expect(mediaCardHeader).not.toBeNull();

    await act(async () => {
      mediaCardHeader?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="provider-detail-back-button"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-detail-back-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="main-providers-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid^="result-media-card-"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-detail-back-button"]')).toBeNull();
    expect(container.querySelector(`[data-testid="provider-row-${fakeProfile.profileId}"]`)).toBeNull();
  });

  it('shows add-page empty state and returns there after saving a profile-originated model config', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({ userModelConfigs: [] });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="providers-add-button"]')?.click();
    });
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="provider-endpoint-detect-input"]')!, 'https://api.openai.com/v1/images/generations');
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="provider-model-empty-notice"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-add-model-config-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.model-config-advanced-toggle')?.click();
    });
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')!, 'new-profile-add-model');
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-config-save-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="provider-save-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-default-model-selector"]')).not.toBeNull();
    expect(services.spies.listUserModelConfigs).toHaveBeenCalledWith('openai-images');
    expect(selectedId(container, 'provider-default-model-selector')).toBe('');
  });

  it('returns to add page when backing out of profile-originated model config creation', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({ userModelConfigs: [] });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="providers-add-button"]')?.click();
    });
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="provider-endpoint-detect-input"]')!, 'https://api.openai.com/v1/images/generations');
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-add-model-config-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-configuration-back-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="provider-save-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-default-model-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).toBeNull();
  });

  it('add page suspends system instruction editor while model menu is open', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({ userModelConfigs: providerModelConfigs });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="providers-add-button"]')?.click();
    });
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="provider-endpoint-detect-input"]')!, 'https://api.openai.com/v1/images/generations');
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-default-model-selector"]')?.click();
    });
    await flush();

    const userOption = document.body.querySelector<HTMLElement>('[data-testid="provider-default-model-selector-option-user-only-model"]');
    expect(container.querySelector('[data-testid="provider-system-instructions-input"]')?.getAttribute('data-native-editor-suspended')).toBe('true');
    expect(userOption).not.toBeNull();
    expect(userOption?.textContent).toContain('user-only-model');
    expect(userOption?.textContent).not.toContain('user-only-model-vip');

    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="provider-default-model-selector-option-user-only-model"]')?.click();
    });
    await flush();

    expect(selectedId(container, 'provider-default-model-selector')).toBe('user-only-model');
    expect(container.querySelector('[data-testid="provider-system-instructions-input"]')?.getAttribute('data-native-editor-suspended')).toBeNull();
  });

  it('detail selector uses only saved user model configs and returns after profile-originated save', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      profiles: [{ ...fakeProfile, defaultModelId: '', selectedModelIds: [] }],
      userModelConfigs: providerModelConfigs,
    });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
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

    const userOption = document.body.querySelector<HTMLElement>('[data-testid="provider-default-model-selector-option-user-only-model"]');
    expect(container.querySelector('[data-testid="provider-system-instructions-input"]')?.getAttribute('data-native-editor-suspended')).toBe('true');
    expect(userOption).not.toBeNull();
    expect(userOption?.textContent).toContain('user-only-model');
    expect(userOption?.textContent).not.toContain('GPT Image 2');
    expect(userOption?.textContent).not.toContain('user-only-model-vip');
    expect(document.body.querySelector('[data-testid="provider-default-model-selector-option-wrong-format-model"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-add-model-config-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.model-config-advanced-toggle')?.click();
    });
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')!, 'detail-created-model');
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-config-save-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="provider-default-model-selector"]')).not.toBeNull();
    expect(services.spies.listUserModelConfigs).toHaveBeenCalledWith('openai-images');
  });

  it('main selector shows saved config modelId but keeps model identity selected', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      activeImageProfileId: 'mock-profile',
      profiles: [{
        ...fakeProfile,
        defaultModelId: 'gpt-image-2-vip',
        selectedModelIds: ['gpt-image-2-vip'],
      }],
      profileModelItems: [
        profileModelItem('gpt-image-2-vip', {
          displayName: 'GPT Image 2',
          configSource: 'user',
          wireModelId: 'gpt-image-2-vip',
          default: true,
          selected: true,
        }),
      ],
    });
    await renderMainPage(container, services);
    await flush();
    await flush();

    const trigger = container.querySelector<HTMLElement>('[data-testid="main-model-selector"]');
    const triggerValue = trigger?.parentElement?.querySelector<HTMLElement>('.cmp-chip-overlay-value');
    expect(trigger?.getAttribute('data-selected-id')).toBe('gpt-image-2-vip');
    expect(triggerValue?.textContent).toContain('gpt-image-2-vip');
    expect(triggerValue?.textContent).not.toContain('GPT Image 2');

    await act(async () => {
      trigger?.click();
    });
    await flush();

    const option = document.body.querySelector<HTMLElement>('[data-testid="main-model-selector-option-gpt-image-2-vip"]');
    expect(option?.textContent).toContain('gpt-image-2-vip');
    expect(option?.textContent).not.toContain('GPT Image 2');
  });

  it('returns to detail page when backing out of profile-originated model config creation', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      profiles: [{ ...fakeProfile, defaultModelId: '', selectedModelIds: [] }],
      userModelConfigs: [],
    });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>(`[data-testid="provider-row-${fakeProfile.profileId}"]`)?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-add-model-config-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-configuration-back-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="provider-default-model-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).toBeNull();
  });
});

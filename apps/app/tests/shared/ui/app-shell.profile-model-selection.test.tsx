import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { UserModelConfig } from '@imagen-ps/application';
import { createFakeServices, fakeProfile, profileModelItem } from '../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../helpers/main-page-harness';

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

    expect(container.querySelector('[data-testid="provider-system-instructions-input"]')?.getAttribute('data-native-editor-suspended')).toBe('true');
    expect(document.body.querySelector('[data-testid="provider-default-model-selector-option-user-only-model"]')).not.toBeNull();

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

    expect(container.querySelector('[data-testid="provider-system-instructions-input"]')?.getAttribute('data-native-editor-suspended')).toBe('true');
    expect(document.body.querySelector('[data-testid="provider-default-model-selector-option-user-only-model"]')).not.toBeNull();
    expect(document.body.textContent).toContain('GPT Image 2');
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

  it('main selector shows wire model label but keeps model identity selected', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createReturningUserServices({
      activeImageProfileId: 'mock-profile',
      profiles: [{
        ...fakeProfile,
        defaultModelId: 'gpt-image-2',
        selectedModelIds: ['gpt-image-2'],
      }],
      profileModelItems: [
        profileModelItem('gpt-image-2', {
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
    expect(trigger?.getAttribute('data-selected-id')).toBe('gpt-image-2');

    await act(async () => {
      trigger?.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="main-model-selector-option-gpt-image-2"]')?.textContent).toContain('GPT Image 2');
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

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { UserModelConfig } from '@imagen-ps/application';
import { createFakeServices, fakeProfile } from '../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../helpers/main-page-harness';

afterEach(async () => {
  await cleanupMainPageRoot();
});

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

describe('AppShell profile model selection flow', () => {
  it('shows add-page empty state and returns there after saving a profile-originated model config', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({ userModelConfigs: [] });
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

    expect(container.textContent).toContain('当前 Profile 还没有可选的已保存模型配置。');

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-add-model-config-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="model-config-model-id"]')).not.toBeNull();

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
    expect(container.textContent).not.toContain('new-profile-add-model');
  });

  it('detail selector uses only saved user model configs and returns after profile-originated save', async () => {
    const userConfigs: readonly UserModelConfig[] = [
      {
        apiFormat: 'openai-images',
        modelId: 'user-only-model',
        baseModelId: 'gpt-image-2',
        requestStrategyId: 'image-endpoint-default',
        outputMatrix: [],
      },
      {
        apiFormat: 'openai-chat-completions',
        modelId: 'wrong-format-model',
        baseModelId: 'gpt-4o-image',
        requestStrategyId: 'image-endpoint-default',
        outputMatrix: [],
      },
    ];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{ ...fakeProfile, defaultModelId: '', selectedModelIds: [] }],
      userModelConfigs: userConfigs,
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

    expect(document.body.querySelector('[data-testid="provider-default-model-selector-option-user-only-model"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="provider-default-model-selector-option-wrong-format-model"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-add-model-config-button"]')?.click();
    });
    await flush();
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
});

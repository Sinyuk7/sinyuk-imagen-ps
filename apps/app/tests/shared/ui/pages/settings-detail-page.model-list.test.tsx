import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeProfile, createFakeServices, profileModelItem } from '../../../helpers/fakes';
import {
  cleanupSettingsDetailRoot,
  flush,
  queryByTestId,
  renderDetailWithRoot,
} from '../../../helpers/settings-detail-harness';

const noopNav = () => vi.fn();
const noopProfilesChanged = () => vi.fn(async () => undefined);

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

describe('SettingsDetailPage contract — model list', () => {
  it('shows only saved model configurations in the profile model list', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        selectedModelIds: ['saved-user-model', 'gpt-image-2'],
        defaultModelId: 'saved-user-model',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [
        profileModelItem('saved-user-model', { default: true, configSource: 'user' }),
        profileModelItem('gpt-image-2', { selected: false, default: false, configSource: 'catalog' }),
      ],
    });
    await renderDetailWithRoot(container, services, 'mock-profile', noopNav(), noopProfilesChanged());

    expect(container.querySelector('[data-testid="provider-model-row-saved-user-model"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-model-row-gpt-image-2"]')).toBeNull();
  });

  it('renders supported saved models in the selectable model list', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        selectedModelIds: ['gpt-image2', 'mock-image-v1'],
        defaultModelId: 'gpt-image2',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [
        profileModelItem('gpt-image2', { default: true, configSource: 'user' }),
        profileModelItem('mock-image-v1', { configSource: 'user' }),
      ],
    });
    await renderDetailWithRoot(container, services, 'mock-profile', noopNav(), noopProfilesChanged());

    await act(async () => {
      queryByTestId(container, 'provider-default-model-selector').click();
    });
    await flush();

    expect(container.querySelector('[data-testid="provider-default-model-selector-option-gpt-image2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-default-model-selector-option-mock-image-v1"]')).not.toBeNull();
  });

  it('renders a single model-list notice container with summary and technical detail', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.listProfileModels.mockResolvedValue({
      ok: false as const,
      error: {
        category: 'validation',
        message: 'Provider implementation "mock" returned malformed discovery payload',
      },
    });
    await renderDetailWithRoot(container, services, 'mock-profile', noopNav(), noopProfilesChanged());

    const noticeHost = queryByTestId(container, 'provider-model-list-notice');
    expect(noticeHost.textContent).toContain('模型列表加载失败');
    expect(noticeHost.textContent).toContain('Provider implementation "mock" returned malformed discovery payload');
    expect(container.querySelectorAll('[data-testid="provider-model-list-notice"]')).toHaveLength(1);
  });

  it('shows an explicit status for a saved but currently undiscovered model', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        selectedModelIds: ['dall-e-3'],
        defaultModelId: 'dall-e-3',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [
        profileModelItem('dall-e-3', { discovered: false, default: true, configSource: 'user' }),
        profileModelItem('gpt-image-2', { selected: false }),
      ],
    });
    await renderDetailWithRoot(container, services, 'mock-profile', noopNav(), noopProfilesChanged());

    expect(queryByTestId(container, 'provider-model-status-notice').textContent).toContain('未发现已保存的模型');
  });

  it('renders the model discovery limitation as FieldHelp and associates it with the controls', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.listProviders.mockReturnValue([{
      id: 'mock',
      family: 'image-endpoint',
      apiFormat: 'openai-images',
      displayName: 'Mock Provider',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
      defaultModels: [{ id: 'mock-image-v1' }],
      connectivity: {
        endpointMeasurement: 'unsupported',
      },
    }]);
    await renderDetailWithRoot(container, services, 'mock-profile', noopNav(), noopProfilesChanged());

    const help = queryByTestId(container, 'provider-model-discovery-help');
    expect(help.textContent).toContain('请选择受支持的预设模型');
    expect(queryByTestId(container, 'provider-default-model-selector').getAttribute('aria-describedby')).toBe('provider-model-discovery-help');
    expect(container.querySelector('[data-testid="provider-model-list-notice"]')).toBeNull();
  });
});

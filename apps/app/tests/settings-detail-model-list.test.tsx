import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeProfile, createFakeServices } from './fakes';
import {
  cleanupSettingsDetailRoot,
  flush,
  queryByTestId,
  renderDetailWithRoot,
} from './settings-detail-harness';

const noopNav = () => vi.fn();
const noopProfilesChanged = () => vi.fn(async () => undefined);

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

describe('SettingsDetailPage contract — model list', () => {
  it('merges the saved custom model into the selectable model list', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          defaultModel: 'gpt-image2',
        },
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [{ id: 'gpt-image2' }, { id: 'mock-image-v1' }],
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
        config: {
          ...fakeProfile.config,
          defaultModel: 'dall-e-3',
        },
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [
        { id: 'dall-e-3', supportStatus: 'saved-undiscovered' },
        { id: 'gpt-image-2', supportStatus: 'selectable' },
      ],
    });
    await renderDetailWithRoot(container, services, 'mock-profile', noopNav(), noopProfilesChanged());

    expect(queryByTestId(container, 'provider-model-status-notice').textContent).toContain('未发现已保存的模型');
  });

  it('shows an explicit status for a custom unchecked model', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          defaultModel: 'custom-model-x',
        },
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [{ id: 'custom-model-x', supportStatus: 'custom-unchecked' }],
    });
    await renderDetailWithRoot(container, services, 'mock-profile', noopNav(), noopProfilesChanged());

    expect(queryByTestId(container, 'provider-model-status-notice').textContent).toContain('当前将按原样发送已配置模型 ID，但可用性尚未验证。');
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
    expect(help.textContent).toContain('请选择预设模型，或填写自定义模型 ID');
    expect(queryByTestId(container, 'provider-default-model-selector').getAttribute('aria-describedby')).toBe('provider-model-discovery-help');
    expect(queryByTestId(container, 'provider-use-custom-model-checkbox').getAttribute('aria-describedby')).toBe('provider-model-discovery-help');
    expect(container.querySelector('[data-testid="provider-model-list-notice"]')).toBeNull();
  });
});

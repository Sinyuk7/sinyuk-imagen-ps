import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderDescriptor } from '@imagen-ps/application';
import { SettingsAddPage } from '../../../../src/shared/ui/pages/settings-add-page';
import { createFakeServices, fakeChatProvider, fakeProfile, fakeProvider } from '../../../helpers/fakes';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { installFlightRecorder } from '../../../helpers/settings-detail-harness';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

function changeInput(input: HTMLElement & { value?: string }, value: string): void {
  if (input instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

function changeTextarea(input: HTMLElement & { value?: string }, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

function queryByTestId(container: HTMLElement, testId: string): HTMLElement & { value?: string } {
  const element = container.querySelector<HTMLElement & { value?: string }>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`找不到元素: ${testId}`);
  }
  return element;
}

async function selectDefaultModel(container: HTMLElement, modelId: string): Promise<void> {
  await act(async () => {
    queryByTestId(container, 'provider-default-model-selector').click();
  });
  await act(async () => {
    const option = container.ownerDocument.body.querySelector<HTMLElement>(`[data-testid="provider-model-row-${modelId}"]`)
      ?? container.ownerDocument.body.querySelector<HTMLElement>(`[data-testid="provider-model-checkbox-${modelId}"]`)
      ?? Array.from(container.ownerDocument.body.querySelectorAll<HTMLElement>('[role="option"],button,label,div,span'))
        .find((node) => node.textContent?.includes(modelId));
    if (!option) {
      throw new Error(`找不到默认模型选项: ${modelId}`);
    }
    option.click();
  });
}

async function detectOpenAiImages(container: HTMLElement, url = 'https://mock.local/images/generations'): Promise<void> {
  await act(async () => {
    changeInput(queryByTestId(container, 'provider-endpoint-detect-input'), url);
  });
}

describe('SettingsAddPage', () => {
  it('starts on the unified API profile editor with auto-detection guidance', async () => {
    const { services, spies } = createFakeServices();
    const imageEndpointProvider: ProviderDescriptor = {
      id: 'image-endpoint',
      family: 'image-endpoint',
      displayName: 'Image Endpoint',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
    };
    const chatImageProvider: ProviderDescriptor = {
      id: 'chat-image',
      family: 'chat-image',
      displayName: 'Chat Image',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
    };
    const mockProvider: ProviderDescriptor = {
      id: 'mock',
      family: 'image-endpoint',
      displayName: 'Mock Provider',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
    };
    spies.listProviders.mockReturnValue([mockProvider, imageEndpointProvider, chatImageProvider]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    expect(container.querySelector('[data-testid="provider-endpoint-detect-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-api-format-status"]')?.textContent).toContain('Auto Detect');
    expect(container.querySelectorAll<HTMLElement>('.provider-type-row')).toHaveLength(0);
  });

  it('saves provider profile through profile commands with write-only secretValues', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-alias-input'), 'Local Mock');
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock.local');
    });
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-api-key-input'), 'secret-key');
      changeTextarea(queryByTestId(container, 'provider-system-instructions-input'), 'Use a crisp editorial tone.\nKeep color natural.');
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: expect.stringMatching(/^profile-/),
        apiFormat: 'openai-images',
        displayName: 'Local Mock',
        systemInstruction: 'Use a crisp editorial tone.\nKeep color natural.',
        secretValues: { apiKey: 'secret-key' },
      }),
    );
    expect(spies.saveProviderProfile.mock.calls[0]?.[0]).not.toHaveProperty('apiKey');
    expect(spies.saveProviderProfile.mock.calls[0]?.[0]).not.toHaveProperty('providerId');
  });

  it('renders the shared system instructions textarea on add profile', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    const field = queryByTestId(container, 'provider-system-instructions-input');
    expect(field.tagName).toBe('TEXTAREA');
    expect(container.textContent).toMatch(/System instructions|系统指令/);
    expect(container.textContent).toMatch(/Optional tone and style instructions for the model|模型语气与风格指令/);
  });

  it('reveals new-api billing fields when that mode is selected', async () => {
    const { services, spies } = createFakeServices();
    const newApiProvider: ProviderDescriptor = {
      id: 'mock',
      family: 'image-endpoint',
      apiFormat: 'openai-images',
      displayName: 'Mock Provider',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
      defaultModels: [{ id: 'mock-image-v1' }],
      billing: {
        supportedModes: ['none', 'new-api'],
        defaultMode: 'new-api',
      },
    };
    spies.listProviders.mockReturnValue([newApiProvider]);
    spies.describeProvider.mockReturnValue(newApiProvider);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);
    await act(async () => {
      queryByTestId(container, 'provider-billing-mode-selector').click();
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-billing-mode-selector-option-new-api"]')!.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryByTestId(container, 'provider-billing-user-id-input')).not.toBeNull();
    expect(queryByTestId(container, 'provider-billing-access-token-input')).not.toBeNull();
  });

  it('prefills a unique alias suggestion from existing profiles', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage
            onNav={() => undefined}
            profiles={[
              {
                profileId: 'profile-1',
                apiFormat: 'openai-images',
                displayName: 'mock.local',
                enabled: true,
                config: {
                  apiFormat: 'openai-images',
                  displayName: 'mock.local',
                  paths: { generation: '/images/generations', edit: '/images/edits' },
                  connection: {
                    selectionMode: 'manual',
                    selectedEndpointId: 'primary',
                    endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
                  },
                },
                createdAt: '2026-06-15T00:00:00.000Z',
                updatedAt: '2026-06-15T00:00:00.000Z',
              },
            ]}
            onProfileSaved={async () => undefined}
          />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    const nameInput = Array.from(container.querySelectorAll<HTMLElement & { value?: string }>('input'))[0];
    expect(nameInput.value).toBe('mock');
  });

  it('auto-generates the alias from endpoint host until the user edits the alias', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container, 'https://api.n1n.ai/v1/images/generations');
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), ' https://api.n1n.ai/v1\n');
    });
    expect((queryByTestId(container, 'provider-alias-input') as HTMLInputElement).value).toBe('n1n');
    expect((queryByTestId(container, 'provider-endpoint-url-0') as HTMLInputElement).value).toBe('https://api.n1n.ai/v1');

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-alias-input'), 'Manual Name');
    });
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://api.other.example/v1');
    });

    expect((queryByTestId(container, 'provider-alias-input') as HTMLInputElement).value).toBe('Manual Name');
  });

  it('does not auto-use a new provider when another provider already exists', async () => {
    const { services } = createFakeServices();
    const onProfileSaved = vi.fn(async () => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[fakeProfile]} onProfileSaved={onProfileSaved} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);
    expect(container.querySelector('[data-testid="provider-use-after-saving"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(onProfileSaved).toHaveBeenCalledWith(expect.stringMatching(/^profile-/), expect.objectContaining({ useProvider: false }));
  });

  it('auto-uses the first saved provider when no provider exists yet', async () => {
    const { services } = createFakeServices();
    const onProfileSaved = vi.fn(async () => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={onProfileSaved} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(onProfileSaved).toHaveBeenCalledWith(expect.stringMatching(/^profile-/), expect.objectContaining({ useProvider: true }));
  });

  it('uses a plain header title and removes unexplained step text on the config screen', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    expect(container.querySelector('.hdr-center')).toBeNull();

    await detectOpenAiImages(container);

    expect(container.querySelector('.hdr-center')).toBeNull();
    expect(container.querySelector('.hdr-title')?.textContent).toMatch(/添加 Provider|Add Provider/);
    expect(container.textContent).not.toContain('2 / 2');
  });

  it('reuses the draft profile id when testing before save', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-alias-input'), 'Test Then Save');
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock.local');
    });
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-api-key-input'), 'secret-key');
    });

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    const testedProfileId = spies.testProviderProfileConnection.mock.calls[0]?.[0].profileId;
    const savedProfileId = spies.saveProviderProfile.mock.calls.at(-1)?.[0].profileId;
    expect(testedProfileId).toMatch(/^profile-/);
    expect(savedProfileId).toBe(testedProfileId);
  });

  it('uses discovered draft models for the add-page selector after connection test', async () => {
    const { services, spies } = createFakeServices();
    spies.testProviderProfileConnection.mockResolvedValueOnce({
      ok: true,
      value: {
        supported: true,
        reachable: true,
        modelCount: 2,
        models: [{ id: 'draft-model-a' }, { id: 'draft-model-b' }],
      },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });

    await act(async () => {
      queryByTestId(container, 'provider-default-model-selector').click();
    });

    expect(container.querySelector('[data-testid="provider-default-model-selector-option-draft-model-a"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-default-model-selector-option-draft-model-b"]')).not.toBeNull();
  });

  it('marks add-page discovered model list stale after unsaved draft changes', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);
    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock.changed');
    });

    expect(queryByTestId(container, 'provider-model-list-notice').textContent).toContain('模型列表可能与未保存的修改不一致');
  });

  it('renders the model discovery limitation as FieldHelp on the add page', async () => {
    const { services, spies } = createFakeServices();
    const unsupportedProvider: ProviderDescriptor = {
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
    };
    spies.listProviders.mockReturnValue([unsupportedProvider]);
    spies.describeProvider.mockReturnValue(unsupportedProvider);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    const help = queryByTestId(container, 'provider-model-discovery-help');
    expect(help.textContent).toContain('请选择受支持的预设模型');
    expect(queryByTestId(container, 'provider-default-model-selector').getAttribute('aria-describedby')).toBe('provider-model-discovery-help');
    expect(container.querySelector('[data-testid="provider-model-list-notice"]')).toBeNull();
  });

  it('refreshes draft models through the draft refresh command without probing endpoints', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock.changed');
      queryByTestId(container, 'provider-refresh-models-button').click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(spies.refreshDraftProfileModels).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        connection: expect.objectContaining({
          endpoints: [expect.objectContaining({ url: 'https://mock.changed' })],
        }),
      }),
    }));
    expect(spies.measureProfileEndpoints).not.toHaveBeenCalled();
  });

  it('saves auto selection config shape on the add page', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock-a.local');
    });
    await act(async () => {
      queryByTestId(container, 'provider-selection-mode-auto').click();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        connection: expect.objectContaining({
          selectionMode: 'auto',
          endpoints: [expect.objectContaining({ url: 'https://mock-a.local' })],
        }),
      }),
    }));
  });

  it('saves the default manual current selection on add page', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock-b.local');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const savedConnection = spies.saveProviderProfile.mock.calls[0]?.[0].config.connection as {
      readonly selectedEndpointId?: string;
      readonly endpoints: readonly { readonly id: string; readonly url: string }[];
    };
    expect(savedConnection.endpoints).toEqual([
      expect.objectContaining({ id: 'primary', url: 'https://mock-b.local' }),
    ]);
    expect(savedConnection.selectedEndpointId).toBe('primary');
    expect(container.querySelectorAll('[data-testid^="provider-endpoint-current-dot-"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="provider-endpoint-current-dot-0"]')).not.toBeNull();
  });

  it('uses a single save action in the add-page footer', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={vi.fn()} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    const footer = container.querySelector('.settings-add-footer');
    expect(footer?.querySelector('[data-testid="provider-test-button"]')).toBeTruthy();
    expect(footer?.querySelector('[data-testid="provider-save-button"]')?.textContent).toMatch(/^(Save|保存)$/);
    const cancel = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
      item.textContent?.includes('取消') || item.textContent?.includes('Cancel'),
    );
    expect(cancel).toBeFalsy();
  });

  it('keeps full IP addresses as alias suggestions', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-detect-input'), 'https://123.45.67.89/v1/chat/completions');
    });

    expect((queryByTestId(container, 'provider-alias-input') as HTMLInputElement).value).toBe('123.45.67.89');
  });

  it('uses the form-style model selector trigger on the add page', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await detectOpenAiImages(container);

    const selector = queryByTestId(container, 'provider-default-model-selector');
    expect(selector.className).toContain('cmp-chip');
    expect(selector.closest('.provider-model-select')).not.toBeNull();
  });

  it('does not auto-apply an extracted model id when imported gemini URL is outside the supported list', async () => {
    const records = installFlightRecorder();
    const { services, spies } = createFakeServices();
    const geminiProvider: ProviderDescriptor = {
      id: 'gemini-generate-content',
      family: 'gemini-generate-content',
      apiFormat: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
      defaultModels: [
        { id: 'gemini-3.1-flash-image', displayName: 'Gemini 3.1 Flash Image' },
        { id: 'gemini-3-pro-image', displayName: 'Gemini 3 Pro Image' },
      ],
      billing: {
        supportedModes: ['none'],
        defaultMode: 'none',
        query: 'unsupported',
      },
      connectivity: {
        endpointMeasurement: 'unsupported',
        connectionTest: 'unsupported',
      },
    };
    spies.listProviders.mockReturnValue([fakeProvider, fakeChatProvider, geminiProvider]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await act(async () => {
      changeInput(
        queryByTestId(container, 'provider-endpoint-detect-input'),
        'https://grsai.dakka.com.cn/v1beta/models/nano-banana-fast:generateContent',
      );
    });

    expect(queryByTestId(container, 'provider-default-model-selector').textContent).not.toContain('nano-banana-fast');
    expect((queryByTestId(container, 'provider-alias-input') as HTMLInputElement).value).toBe('grsai');
    expect(queryByTestId(container, 'provider-model-discovery-help').textContent).toContain('请选择受支持的预设模型');
    expect(JSON.stringify(records)).toContain('uxp.ui.settings_add.endpoint_import');
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderDescriptor } from '@imagen-ps/application';
import { SettingsAddPage } from '../src/shared/ui/pages/settings-add-page';
import { createFakeServices, fakeProfile } from './fakes';
import { TestAppProviders } from './render-helpers';

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

function queryByTestId(container: HTMLElement, testId: string): HTMLElement & { value?: string } {
  const element = container.querySelector<HTMLElement & { value?: string }>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`找不到元素: ${testId}`);
  }
  return element;
}

async function switchToCustomModel(container: HTMLElement): Promise<void> {
  await act(async () => {
    const checkbox = container.querySelector<HTMLInputElement>('input[data-testid="provider-use-custom-model-checkbox"]');
    if (!checkbox) {
      throw new Error('找不到自定义 model id checkbox');
    }
    checkbox.click();
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
    await switchToCustomModel(container);
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-default-model-input'), 'mock-image-v1');
      changeInput(queryByTestId(container, 'provider-api-key-input'), 'secret-key');
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: expect.stringMatching(/^profile-/),
        apiFormat: 'openai-images',
        displayName: 'Local Mock',
        secretValues: { apiKey: 'secret-key' },
      }),
    );
    expect(spies.saveProviderProfile.mock.calls[0]?.[0]).not.toHaveProperty('apiKey');
    expect(spies.saveProviderProfile.mock.calls[0]?.[0]).not.toHaveProperty('providerId');
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
    expect(nameInput.value).toBe('mock.local 2');
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
    expect((queryByTestId(container, 'provider-alias-input') as HTMLInputElement).value).toBe('n1n.ai');
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

    expect(onProfileSaved).toHaveBeenCalledWith(expect.stringMatching(/^profile-/), { useProvider: false });
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

    expect(onProfileSaved).toHaveBeenCalledWith(expect.stringMatching(/^profile-/), { useProvider: true });
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
    await switchToCustomModel(container);
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-default-model-input'), 'mock-image-v1');
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

  it('keeps cancel as a content-width secondary action beside the primary save action', async () => {
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
    expect(footer?.querySelector('[data-testid="provider-save-button"]')?.textContent).toMatch(/^(Save Provider|保存 Provider)$/);
    const cancel = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
      item.textContent?.includes('取消') || item.textContent?.includes('Cancel'),
    );
    expect(cancel).toBeTruthy();
    expect(cancel?.className).toContain('btn-cancel');
    expect(cancel?.className).not.toContain('ui-button-block');
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
});

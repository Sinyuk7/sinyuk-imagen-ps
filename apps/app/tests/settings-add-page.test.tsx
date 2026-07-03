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

describe('SettingsAddPage', () => {
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });

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
        providerId: 'mock',
        displayName: 'Local Mock',
        secretValues: { apiKey: 'secret-key' },
      }),
    );
    expect(spies.saveProviderProfile.mock.calls[0]?.[0]).not.toHaveProperty('apiKey');
  });

  it('reveals new-api billing fields when that mode is selected', async () => {
    const { services, spies } = createFakeServices();
    const newApiProvider: ProviderDescriptor = {
      id: 'mock',
      family: 'image-endpoint',
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });
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
                providerId: 'mock',
                displayName: 'Mock Provider',
                enabled: true,
                config: {
                  providerId: 'mock',
                  displayName: 'Mock Provider',
                  family: 'image-endpoint',
                  connection: {
                    selectionMode: 'manual',
                    failoverEnabled: false,
                    preferredEndpointId: 'primary',
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });

    const nameInput = Array.from(container.querySelectorAll<HTMLElement & { value?: string }>('input'))[0];
    expect(nameInput.value).toBe('Mock Provider 2');
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });
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

  it('does not opt into using a new provider by default when another provider already exists', async () => {
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });
    expect((queryByTestId(container, 'provider-use-after-saving') as HTMLInputElement).checked).toBe(false);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(onProfileSaved).toHaveBeenCalledWith(expect.stringMatching(/^profile-/), { useProvider: false });
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });

    expect(container.querySelector('.hdr-center')).toBeNull();
    expect(container.querySelector('.hdr-title')?.textContent).toContain('Mock Provider');
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });

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

    const testedProfileId = spies.probeProfileEndpoints.mock.calls[0]?.[0].profileId;
    const savedProfileId = spies.saveProviderProfile.mock.calls.at(-1)?.[0].profileId;
    expect(testedProfileId).toMatch(/^profile-/);
    expect(savedProfileId).toBe(testedProfileId);
  });

  it('adds endpoint rows and saves auto/manual plus failover config shape', async () => {
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock-a.local');
    });
    await act(async () => {
      queryByTestId(container, 'provider-endpoint-add').click();
    });
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-1'), 'https://mock-b.local');
    });
    await act(async () => {
      queryByTestId(container, 'provider-selection-mode-auto').click();
      queryByTestId(container, 'provider-failover-enabled').click();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        connection: expect.objectContaining({
          selectionMode: 'auto',
          failoverEnabled: true,
          endpoints: expect.arrayContaining([
            expect.objectContaining({ url: 'https://mock-a.local' }),
            expect.objectContaining({ url: 'https://mock-b.local' }),
          ]),
        }),
      }),
    }));
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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });

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

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-type-mock"]')!.click();
    });

    const selector = queryByTestId(container, 'provider-default-model-selector');
    expect(selector.className).toContain('cmp-chip');
    expect(selector.closest('.provider-model-select')).not.toBeNull();
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsAddPage } from '../src/shared/ui/pages/settings-add-page';
import { createFakeServices } from './fakes';
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
      container.querySelector<HTMLElement>('.prov-row')!.click();
    });

    const inputs = Array.from(container.querySelectorAll<HTMLElement & { value?: string }>('sp-textfield, input'));
    await act(async () => {
      changeInput(inputs[0]!, 'Local Mock');
      changeInput(inputs[1]!, 'https://mock.local');
      changeInput(inputs[2]!, 'mock-image-v1');
      changeInput(inputs[3]!, 'secret-key');
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
                  baseURL: 'https://mock.local',
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
      container.querySelector<HTMLElement>('.prov-row')!.click();
    });

    const nameInput = Array.from(container.querySelectorAll<HTMLElement & { value?: string }>('sp-textfield, input'))[0];
    expect(nameInput.value).toBe('Mock Provider(1)');
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
      container.querySelector<HTMLElement>('.prov-row')!.click();
    });

    const inputs = Array.from(container.querySelectorAll<HTMLElement & { value?: string }>('sp-textfield, input'));
    await act(async () => {
      changeInput(inputs[0]!, 'Test Then Save');
      changeInput(inputs[1]!, 'https://mock.local');
      changeInput(inputs[2]!, 'mock-image-v1');
      changeInput(inputs[3]!, 'secret-key');
    });

    await act(async () => {
      container.querySelector<HTMLElement>('.test-btn')!.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    const testedProfileId = spies.testProviderProfile.mock.calls[0]?.[0];
    const savedProfileId = spies.saveProviderProfile.mock.calls.at(-1)?.[0].profileId;
    expect(testedProfileId).toMatch(/^profile-/);
    expect(savedProfileId).toBe(testedProfileId);
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppServicesProvider } from '../src/app-services/app-services-context';
import { SettingsAddPage } from '../src/ui/pages/settings-add-page';
import { createFakeServices } from './fakes';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SettingsAddPage', () => {
  it('saves provider profile through profile commands with write-only secretValues', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppServicesProvider services={services}>
          <SettingsAddPage onNav={() => undefined} onProfileSaved={async () => undefined} />
        </AppServicesProvider>,
      );
    });

    await act(async () => {
      container.querySelector<HTMLElement>('.prov-row')!.click();
    });

    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'));
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
        profileId: 'mock-local-mock',
        providerId: 'mock',
        displayName: 'Local Mock',
        secretValues: { apiKey: 'secret-key' },
      }),
    );
    expect(spies.saveProviderProfile.mock.calls[0]?.[0]).not.toHaveProperty('apiKey');
  });
});

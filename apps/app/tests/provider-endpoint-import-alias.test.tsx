import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile } from '@imagen-ps/application';
import { SettingsDetailPage } from '../src/shared/ui/pages/settings-detail-page';
import { createFakeServices } from './fakes';
import { TestAppProviders } from './render-helpers';
import { installFlightRecorder } from './settings-detail-harness';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

function byTestId<T extends HTMLElement>(container: HTMLElement, testId: string): T {
  const node = container.querySelector<T>(`[data-testid="${testId}"]`);
  if (!node) {
    throw new Error(`找不到元素: ${testId}`);
  }
  return node;
}

describe('Provider endpoint import alias behavior', () => {
  it('keeps detail-page alias stable while still normalizing a gemini full URL through the shared import model', async () => {
    const records = installFlightRecorder();
    const profile: ProviderProfile = {
      profileId: 'gemini-profile',
      apiFormat: 'gemini-generate-content',
      displayName: 'Existing Alias',
      enabled: true,
      config: {
        apiFormat: 'gemini-generate-content',
        displayName: 'Existing Alias',
        connection: {
          selectionMode: 'manual',
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://old.example/v1beta', enabled: true }],
        },
        paths: {
          invokeTemplate: '/models/{model}:generateContent',
        },
        authMode: 'bearer',
        defaultModel: 'gemini-3.1-flash-image',
      },
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
    };
    const services = createFakeServices({ profiles: [profile] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services.services}>
          <SettingsDetailPage
            onNav={vi.fn()}
            profileId="gemini-profile"
            onProfilesChanged={vi.fn(async () => undefined)}
          />
        </TestAppProviders>,
      );
    });

    await act(async () => {
      setInputValue(
        byTestId<HTMLInputElement>(container, 'provider-endpoint-url-0'),
        'https://grsai.dakka.com.cn/v1beta/models/nano-banana-fast:generateContent',
      );
    });

    expect((byTestId<HTMLInputElement>(container, 'provider-alias-input')).value).toBe('Existing Alias');
    expect((byTestId<HTMLInputElement>(container, 'provider-endpoint-url-0')).value).toBe('https://grsai.dakka.com.cn/v1beta');
    expect(JSON.stringify(records)).toContain('uxp.ui.settings_detail.endpoint_import');
  });
});

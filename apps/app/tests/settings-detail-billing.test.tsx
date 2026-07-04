import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeServices } from './fakes';
import type { ProviderProfile } from '@imagen-ps/application';
import {
  cleanupSettingsDetailRoot,
  flush,
  queryByTestId,
  renderDetail,
  renderDetailWithRoot,
} from './settings-detail-harness';

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

describe('SettingsDetailPage contract — billing', () => {
  it('renders billing summary and refresh action for non-optimizer profiles', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    expect(container.textContent).toContain('余额与计费');
    expect(container.textContent).toContain('当前余额');
    expect(container.textContent).toContain('12.50 USD');
    expect(container.querySelector('[data-testid="provider-billing-mode-selector"]')).toBeNull();

    await act(async () => {
      queryByTestId(container, 'provider-billing-expand-button').click();
    });
    await flush();

    expect(container.querySelector('[data-testid="provider-billing-mode-selector"]')).not.toBeNull();

    await act(async () => {
      queryByTestId(container, 'provider-billing-refresh-button').click();
    });
    await flush();

    expect(spies.refreshProfileBalance).toHaveBeenCalledWith({ profileId: 'mock-profile' });
    expect(container.textContent).toContain('12.50 USD');
  });

  it('shows explicit saved billing token replace and remove actions for new-api mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        profileId: 'mock-profile',
        providerId: 'mock',
        displayName: 'Mock Profile',
        enabled: true,
        config: {
          providerId: 'mock',
          displayName: 'Mock Profile',
          family: 'image-endpoint',
          connection: {
            selectionMode: 'manual',
            selectedEndpointId: 'primary',
            endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
          },
          defaultModel: 'mock-image-v1',
          billing: {
            mode: 'new-api',
            userId: '10001',
            accessTokenSecretRef: 'secret:provider-profile:mock-profile:billingAccessToken',
          },
        },
        secretRefs: {
          apiKey: 'secret:provider-profile:mock-profile:apiKey',
          billingAccessToken: 'secret:provider-profile:mock-profile:billingAccessToken',
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      } satisfies ProviderProfile],
    });
    services.spies.describeProvider.mockReturnValue({
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
    });
    await renderDetailWithRoot(container, services, 'mock-profile', vi.fn(), vi.fn(async () => undefined));

    await act(async () => {
      queryByTestId(container, 'provider-billing-expand-button').click();
    });
    await flush();

    expect(queryByTestId(container, 'provider-billing-access-token-saved-meta').textContent).toMatch(/已安全保存|Saved/);
    await act(async () => {
      queryByTestId(container, 'provider-billing-access-token-edit').click();
    });
    await flush();
    expect((queryByTestId(container, 'provider-billing-access-token-input') as HTMLInputElement).placeholder).toMatch(/替换|replace/i);
    expect(queryByTestId(container, 'provider-billing-access-token-remove')).not.toBeNull();
  });

  it('preserves same-frame billing user and token edits when saving', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        profileId: 'mock-profile',
        providerId: 'mock',
        displayName: 'Mock Profile',
        enabled: true,
        config: {
          providerId: 'mock',
          displayName: 'Mock Profile',
          family: 'image-endpoint',
          connection: {
            selectionMode: 'manual',
            selectedEndpointId: 'primary',
            endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
          },
          defaultModel: 'mock-image-v1',
          billing: { mode: 'new-api', userId: '', accessTokenSecretRef: '' },
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      } satisfies ProviderProfile],
    });
    services.spies.describeProvider.mockReturnValue({
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
    });
    await renderDetailWithRoot(container, services, 'mock-profile', vi.fn(), vi.fn(async () => undefined));

    await act(async () => {
      queryByTestId(container, 'provider-billing-expand-button').click();
    });
    await flush();
    await act(async () => {
      const userInput = queryByTestId(container, 'provider-billing-user-id-input') as HTMLInputElement;
      const tokenInput = queryByTestId(container, 'provider-billing-access-token-input') as HTMLInputElement;
      userInput.value = '10001';
      userInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: '1' }));
      tokenInput.value = 'billing-token';
      tokenInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
    });
    await act(async () => {
      queryByTestId(container, 'provider-save-button').click();
    });

    expect(services.spies.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        billing: expect.objectContaining({
          mode: 'new-api',
          userId: '10001',
          accessTokenSecretRef: 'secret:pending:billingAccessToken',
        }),
      }),
      secretValues: expect.objectContaining({
        billingAccessToken: 'billing-token',
      }),
    }));
  });

  it('compacts quota values in the billing detail card', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    const onNav = vi.fn();
    const onProfilesChanged = vi.fn(async () => undefined);
    services.spies.getProfileBillingState.mockResolvedValue({
      ok: true as const,
      value: {
        refreshState: 'idle',
        balance: {
          profileId: 'mock-profile',
          providerId: 'mock',
          checkedAt: Date.now(),
          snapshot: {
            primary: {
              kind: 'quota',
              remaining: '2227206',
              unit: 'quota',
            },
            details: [{
              kind: 'quota',
              label: 'Used quota',
              value: '12882761',
              unit: 'quota',
            }],
          },
        },
      },
    });
    await renderDetailWithRoot(container, services, 'mock-profile', onNav, onProfilesChanged);

    await act(async () => {
      queryByTestId(container, 'provider-billing-expand-button').click();
    });
    await flush();

    expect(container.textContent).toContain('2.227M quota');
    expect(container.textContent).toContain('12.88M quota');
    expect(container.textContent).not.toContain('2227206 quota');
    expect(container.textContent).not.toContain('12882761 quota');
  });

  it('keeps billing refresh as a compact summary action instead of a full-width block button', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const refresh = queryByTestId(container, 'provider-billing-refresh-button');
    expect(refresh.className).toContain('settings-icon-button');
    expect(refresh.className).not.toContain('ui-button-block');
  });
});

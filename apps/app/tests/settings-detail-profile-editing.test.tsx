import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeProfile, createFakeServices } from './fakes';
import {
  buttonByText,
  changeInput,
  cleanupSettingsDetailRoot,
  queryByTestId,
  renderDetail,
  renderDetailWithRoot,
  switchToCustomModel,
} from './settings-detail-harness';

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

describe('SettingsDetailPage contract — profile editing', () => {
  it('saves edited provider profile through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onNav = vi.fn();
    const services = createFakeServices();
    await renderDetailWithRoot(container, services, 'mock-profile', onNav, vi.fn(async () => undefined));

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-alias-input'), 'Renamed Mock');
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock.changed');
    });
    await switchToCustomModel(container);
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-default-model-input'), 'mock-image-v2');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(services.spies.saveProviderProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'mock-profile',
        providerId: 'mock',
        displayName: 'Renamed Mock',
        enabled: true,
        config: expect.objectContaining({
          defaultModel: 'mock-image-v2',
          connection: {
            selectionMode: 'manual',
            failoverEnabled: false,
            preferredEndpointId: 'primary',
            endpoints: [{
              id: 'primary',
              url: 'https://mock.changed',
              enabled: true,
            }],
          },
        }),
      }),
    );
    expect(onNav).toHaveBeenCalledWith('settings');
  });

  it('deletes provider profile through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onNav = vi.fn();
    const onProfilesChanged = vi.fn(async () => undefined);
    const services = createFakeServices();
    await renderDetailWithRoot(container, services, 'mock-profile', onNav, onProfilesChanged);

    await act(async () => {
      queryByTestId(container, 'provider-delete-button').click();
    });

    expect(services.spies.deleteProviderProfile).toHaveBeenCalledWith('mock-profile');
    expect(onProfilesChanged).toHaveBeenCalledWith(null);
    expect(onNav).toHaveBeenCalledWith('settings');
  });

  it('marks the preferred endpoint with a semantic dot instead of a preferred text badge', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    expect(container.querySelector('[data-testid="provider-endpoint-preferred-dot-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-endpoint-preferred-badge-0"]')).toBeNull();
  });

  it('renders delete as a header action after refresh without danger-zone copy', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const refreshButton = queryByTestId(container, 'provider-detail-refresh-button');
    const deleteButton = queryByTestId(container, 'provider-delete-button');
    expect(deleteButton.className).toContain('hdr-btn');
    expect(deleteButton.getAttribute('aria-label')).toMatch(/删除|Delete/);
    expect(deleteButton.closest('.hdr')).not.toBeNull();
    expect(deleteButton.closest('.scroll')).toBeNull();
    expect(container.querySelector('.settings-danger-zone')).toBeNull();
    expect(refreshButton.compareDocumentPosition(deleteButton) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('renders a plain page header title without provider enable status affordances', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    expect(container.querySelector('.hdr-center')).toBeNull();
    expect(container.querySelector('.page-header-title')?.textContent).toContain('Mock Profile');
    expect(container.querySelector('.page-header-status')).toBeNull();
    expect(container.querySelector('[data-testid="provider-enabled-checkbox"]')).toBeNull();
    expect(container.textContent).not.toContain('Enable profile');
  });

  it('does not send secretValues when API key field is left blank', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    const input = spies.saveProviderProfile.mock.calls[0]?.[0];
    expect(input).toBeDefined();
    expect(input).not.toHaveProperty('secretValues');
    expect(input).not.toHaveProperty('apiKey');
  });

  it('shows explicit saved api key replace and remove actions', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const input = queryByTestId(container, 'provider-api-key-input') as HTMLInputElement;
    expect(input.placeholder).toMatch(/替换|replace/i);
    expect(queryByTestId(container, 'provider-api-key-saved-meta').textContent).toMatch(/已安全保存|Saved/);
    expect(queryByTestId(container, 'provider-api-key-replace')).not.toBeNull();
    expect(queryByTestId(container, 'provider-api-key-remove')).not.toBeNull();
  });

  it('persists explicit api key removal only after the remove action', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      queryByTestId(container, 'provider-api-key-remove').click();
    });
    expect(queryByTestId(container, 'provider-api-key-removal-pending').textContent).toMatch(/移除|removed/i);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
      removedSecretNames: ['apiKey'],
    }));
  });
});

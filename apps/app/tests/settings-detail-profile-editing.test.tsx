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
      container.querySelector<HTMLButtonElement>('.btn-del')!.click();
    });

    expect(container.querySelector('.btn-del-host')).not.toBeNull();
    expect(container.querySelector('.btn-del')?.className).not.toContain('ui-icon-button--compact-square');
    expect(container.querySelector('.btn-del-host')?.className).not.toContain('ui-icon-button-host--compact-square');
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

  it('keeps detail delete as a footer-aligned solid icon action', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const button = queryByTestId(container, 'provider-delete-button');
    const host = button.closest('.ui-icon-button-host');
    const overlay = host?.querySelector('.ui-icon-button-overlay');
    expect(button.getAttribute('data-variant')).toBe('negative');
    expect(button.textContent?.trim()).toBe('');
    expect(button.className).toContain('btn-del');
    expect(button.className).not.toContain('ui-icon-button--compact-square');
    expect(host?.className).toContain('btn-del-host');
    expect(host?.className).not.toContain('ui-icon-button-host--compact-square');
    expect(overlay?.className).not.toContain('ui-icon-button-overlay--compact-square');
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
});

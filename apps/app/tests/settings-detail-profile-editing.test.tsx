import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeProfile, createFakeServices } from './fakes';
import { SettingsDetailPage } from '../src/shared/ui/pages/settings-detail-page';
import { TestAppProviders } from './render-helpers';
import {
  buttonByText,
  changeInput,
  cleanupSettingsDetailRoot,
  flush,
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
        apiFormat: 'openai-images',
        displayName: 'Renamed Mock',
        enabled: true,
        config: expect.objectContaining({
          defaultModel: 'mock-image-v2',
          connection: expect.objectContaining({
            selectionMode: 'manual',
            selectedEndpointId: 'primary',
            endpoints: [{
              id: 'primary',
              url: 'https://mock.changed',
              enabled: true,
            }],
          }),
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

  it('marks the current endpoint with a semantic dot instead of a text badge', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    expect(container.querySelector('[data-testid="provider-endpoint-current-dot-0"]')).not.toBeNull();
    expect(container.querySelector('.provider-endpoint-meta-current')?.textContent).toMatch(/当前|Current/);
  });

  it('renders delete as a header action without danger-zone copy', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const deleteButton = queryByTestId(container, 'provider-delete-button');
    expect(deleteButton.className).toContain('hdr-btn');
    expect(deleteButton.getAttribute('aria-label')).toMatch(/删除|Delete/);
    expect(deleteButton.closest('.hdr')).not.toBeNull();
    expect(deleteButton.closest('.scroll')).toBeNull();
    expect(container.querySelector('.settings-danger-zone')).toBeNull();
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

  it('ignores stale profile loads after switching to another profile', async () => {
    const profileA = {
      ...fakeProfile,
      profileId: 'profile-a',
      displayName: 'Profile A',
    };
    const profileB = {
      ...fakeProfile,
      profileId: 'profile-b',
      displayName: 'Profile B',
      config: {
        ...fakeProfile.config,
        displayName: 'Profile B',
        connection: {
          selectionMode: 'manual' as const,
          selectedEndpointId: 'primary',
          endpoints: [{ id: 'primary', url: 'https://profile-b.local', enabled: true }],
        },
      },
    };
    const services = createFakeServices({ profiles: [profileA, profileB] });
    let resolveA: ((value: Awaited<ReturnType<typeof services.spies.getProviderProfile>>) => void) | undefined;
    let resolveB: ((value: Awaited<ReturnType<typeof services.spies.getProviderProfile>>) => void) | undefined;
    services.spies.getProviderProfile.mockImplementation((profileId: string) => new Promise((resolve) => {
      if (profileId === 'profile-a') {
        resolveA = resolve;
        return;
      }
      resolveB = resolve;
    }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const render = (profileId: string) => root.render(
      <TestAppProviders services={services.services}>
        <SettingsDetailPage onNav={vi.fn()} profileId={profileId} onProfilesChanged={vi.fn(async () => undefined)} />
      </TestAppProviders>,
    );

    try {
      await act(async () => {
        render('profile-a');
      });
      await act(async () => {
        render('profile-b');
      });
      await act(async () => {
        resolveB?.({ ok: true as const, value: profileB });
      });
      await flush();
      expect(container.textContent).toContain('Profile B');
      expect((queryByTestId(container, 'provider-endpoint-url-0') as HTMLInputElement).value).toBe('https://profile-b.local');

      await act(async () => {
        resolveA?.({ ok: true as const, value: profileA });
      });
      await flush();

      expect(container.textContent).toContain('Profile B');
      expect(container.textContent).not.toContain('Profile A');
      expect((queryByTestId(container, 'provider-endpoint-url-0') as HTMLInputElement).value).toBe('https://profile-b.local');
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('does not send secretValues when API key field is left blank', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-alias-input'), 'Renamed Mock');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    const input = spies.saveProviderProfile.mock.calls[0]?.[0];
    expect(input).toBeDefined();
    expect(input).not.toHaveProperty('secretValues');
    expect(input).not.toHaveProperty('apiKey');
  });

  it('shows explicit saved api key edit and remove actions', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    expect(queryByTestId(container, 'provider-api-key-saved-meta').textContent).toMatch(/已安全保存|Saved/);
    expect(queryByTestId(container, 'provider-api-key-edit')).not.toBeNull();
    expect(queryByTestId(container, 'provider-api-key-remove')).not.toBeNull();

    await act(async () => {
      queryByTestId(container, 'provider-api-key-edit').click();
    });
    await flush();

    const input = queryByTestId(container, 'provider-api-key-input') as HTMLInputElement;
    expect(input.placeholder).toMatch(/替换|replace/i);
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

  it('uses the unified Save label on the detail page', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-alias-input'), 'Dirty Mock');
    });
    await flush();

    const saveButton = container.querySelector<HTMLButtonElement>('[data-testid="provider-save-button"]');
    expect(saveButton?.textContent).toMatch(/^(Save|保存)$/);
    expect(container.textContent).not.toContain('Save changes');
    expect(container.textContent).not.toContain('保存修改');
  });

  it('keeps Save visible but disabled when the detail form is clean', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);
    await flush();

    const saveButton = queryByTestId(container, 'provider-save-button') as HTMLButtonElement;
    expect(saveButton.textContent).toMatch(/^(Save|保存)$/);
    expect(saveButton.disabled).toBe(true);
    expect(container.textContent).not.toContain('Save changes');
    expect(container.textContent).not.toContain('保存修改');
    expect(container.textContent).not.toContain('Saved');
    expect(container.textContent).not.toContain('已保存');
  });

  it('allows saving a custom manual model after draft model refresh fails', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    spies.refreshDraftProfileModels.mockResolvedValueOnce({
      ok: false,
      error: {
        category: 'provider',
        message: 'Model discovery failed for draft profile.',
      },
    });

    await act(async () => {
      queryByTestId(container, 'provider-use-custom-model-checkbox').click();
    });
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-default-model-input'), 'custom-model-x');
      queryByTestId(container, 'provider-refresh-models-button').click();
    });
    await flush();

    await act(async () => {
      queryByTestId(container, 'provider-save-button').click();
    });
    await flush();

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        defaultModel: 'custom-model-x',
      }),
    }));
  });
});

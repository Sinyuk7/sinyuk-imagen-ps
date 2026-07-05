import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  changeInput,
  cleanupSettingsDetailRoot,
  flush,
  queryByTestId,
  renderDetail,
  renderDetailWithRoot,
} from '../../../helpers/settings-detail-harness';
import { createFakeServices, fakeProfile } from '../../../helpers/fakes';

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

async function renderDetailWithSecondaryEndpoint(container: HTMLElement) {
  const services = createFakeServices({
    profiles: [
      {
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          connection: {
            selectionMode: 'manual' as const,
            selectedEndpointId: 'primary',
            endpoints: [
              { id: 'primary', url: 'https://mock.local', enabled: true },
              { id: 'secondary', url: 'https://mock-secondary.local', enabled: true },
            ],
          },
        },
      },
    ],
  });
  await renderDetailWithRoot(container, services, 'mock-profile', vi.fn(), vi.fn(async () => undefined));
  return services;
}

describe('SettingsDetailPage contract — connectivity', () => {
  it('tests provider profile and refreshes models through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await flush();

    expect(spies.saveProviderProfile).not.toHaveBeenCalled();
    expect(spies.testProviderProfileConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'mock-profile',
        apiFormat: 'openai-images',
      }),
    );
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('连接成功');

    await act(async () => {
      queryByTestId(container, 'provider-refresh-models-button').click();
    });
    await flush();

    expect(spies.refreshProfileModels).toHaveBeenCalledWith('mock-profile');
  });

  it('refreshes draft model candidates without persisting unsaved config', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies, onProfilesChanged } = await renderDetail(container);

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock.changed');
    });

    await act(async () => {
      queryByTestId(container, 'provider-refresh-models-button').click();
    });
    await flush();

    expect(spies.saveProviderProfile).not.toHaveBeenCalled();
    expect(onProfilesChanged).not.toHaveBeenCalled();
    expect(spies.refreshProfileModels).not.toHaveBeenCalled();
    expect(spies.refreshDraftProfileModels).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'mock-profile',
        config: expect.objectContaining({
          connection: expect.objectContaining({
            endpoints: [
              expect.objectContaining({
                url: 'https://mock.changed',
              }),
            ],
          }),
        }),
      }),
    );
    expect(spies.measureProfileEndpoints).not.toHaveBeenCalled();
  });

  it('marks connection proof stale when a tested draft changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await flush();
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('连接成功');

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock.changed');
    });

    expect(container.querySelector('.settings-detail-footer-actions .status-notice')).toBeNull();
    expect(container.querySelector('.settings-detail-footer-actions .test-status')).toBeNull();
  });

  it('shows copyable connection errors instead of a saved status while testing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    spies.testProviderProfileConnection.mockResolvedValueOnce({
      ok: true,
      value: {
        supported: true,
        reachable: false,
        message: "Cannot read properties of undefined (reading 'addEventListener')",
      },
    });

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await flush();

    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast?.textContent).toContain("连接失败: Cannot read properties of undefined (reading 'addEventListener')");
  });

  it('keeps the test button disabled until the connection test finishes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    let resolveTest: ((value: Awaited<ReturnType<typeof spies.testProviderProfileConnection>>) => void) | undefined;
    spies.testProviderProfileConnection.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTest = resolve;
        }),
    );

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
      await Promise.resolve();
    });

    expect(queryByTestId(container, 'provider-test-button').disabled).toBe(true);

    await act(async () => {
      resolveTest?.({
        ok: true,
        value: {
          supported: true,
          reachable: true,
          modelCount: 1,
        },
      });
    });
    await flush();

    expect(Boolean(queryByTestId(container, 'provider-test-button').disabled)).toBe(false);
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('连接成功');
  });

  it('does not render inline test-result status in the footer', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await flush();

    expect(container.querySelector('.settings-detail-footer-actions .status-notice')).toBeNull();
    expect(container.querySelector('.settings-detail-footer-actions .test-status')).toBeNull();
  });

  it('switches to auto without persisting config', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetailWithSecondaryEndpoint(container);
    await act(async () => {
      queryByTestId(container, 'provider-selection-mode-auto').click();
    });
    await flush();
    await flush();

    expect((queryByTestId(container, 'provider-selection-mode-auto') as HTMLInputElement).checked).toBe(true);
    expect(container.textContent).toMatch(/端点由系统自动选择|Endpoint selected automatically/);
    expect(spies.saveProviderProfile).not.toHaveBeenCalled();
    expect(spies.measureProfileEndpoints).toHaveBeenCalled();
  });

  it('keeps current endpoint selection singular across rapid clicks', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetailWithSecondaryEndpoint(container);
    await act(async () => {
      queryByTestId(container, 'provider-endpoint-row-1').click();
      queryByTestId(container, 'provider-endpoint-row-0').click();
      queryByTestId(container, 'provider-endpoint-row-1').click();
    });
    await flush();

    expect(container.querySelectorAll('[data-testid^="provider-endpoint-current-dot-"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="provider-endpoint-current-dot-1"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });
    await flush();

    const savedConnection = spies.saveProviderProfile.mock.calls[0]?.[0].config.connection as {
      readonly selectedEndpointId?: string;
      readonly endpoints: readonly { readonly id: string; readonly url: string }[];
    };
    const secondEndpoint = savedConnection.endpoints.find((endpoint) => endpoint.url === 'https://mock-secondary.local');
    expect(secondEndpoint).toBeDefined();
    expect(savedConnection.selectedEndpointId).toBe(secondEndpoint?.id);
  });

  it('keeps draft inputs editable while a connection test is pending', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    let resolveTest: ((value: Awaited<ReturnType<typeof spies.testProviderProfileConnection>>) => void) | undefined;
    spies.testProviderProfileConnection.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTest = resolve;
        }),
    );

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
      await Promise.resolve();
    });
    await flush();

    expect((queryByTestId(container, 'provider-endpoint-url-0') as HTMLInputElement).disabled).toBe(false);
    expect((queryByTestId(container, 'provider-alias-input') as HTMLInputElement).disabled).toBe(false);
    expect(queryByTestId(container, 'provider-test-button').disabled).toBe(true);

    await act(async () => {
      resolveTest?.({
        ok: true,
        value: {
          supported: true,
          reachable: true,
          modelCount: 1,
        },
      });
    });
    await flush();

    expect((queryByTestId(container, 'provider-endpoint-url-0') as HTMLInputElement).disabled).toBe(false);
    expect(queryByTestId(container, 'provider-test-button').disabled).toBe(false);
  });

  it('renders the test button as a compact icon with nearby test result meta', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const button = container.querySelector('[data-testid="provider-test-button"]');
    expect(button).not.toBeNull();
    expect(button?.classList.contains('ui-icon-button')).toBe(true);
    expect(container.querySelector('[data-icon-name="network"]')).not.toBeNull();

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await flush();

    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('连接成功');
    expect(container.querySelector('.settings-detail-footer-actions .status-notice')).toBeNull();
    expect(container.querySelector('.settings-detail-footer-actions .test-status')).toBeNull();
  });

  it('keeps refresh model list as a compact inline action', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const refresh = queryByTestId(container, 'provider-refresh-models-button');
    expect(refresh.className).toContain('settings-icon-button');
    expect(refresh.className).not.toContain('ui-button-block');
  });
});

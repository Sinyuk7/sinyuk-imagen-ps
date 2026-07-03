import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  changeInput,
  cleanupSettingsDetailRoot,
  flush,
  queryByTestId,
  renderDetail,
} from './settings-detail-harness';

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

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
    expect(spies.probeProfileEndpoints).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'mock-profile',
        providerId: 'mock',
      }),
    );
    expect(container.textContent).toContain('连接成功');

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
    expect(spies.probeProfileEndpoints).toHaveBeenCalledWith(
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
  });

  it('marks connection proof stale when a tested draft changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await flush();
    expect(container.textContent).toContain('连接成功');

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://mock.changed');
    });

    expect(container.textContent).toContain('修改尚未测试');
  });

  it('shows copyable connection errors instead of a saved status while testing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    spies.probeProfileEndpoints.mockResolvedValueOnce({
      ok: true,
        value: {
          results: [{
            endpointId: 'primary',
            status: 'unreachable',
            checkedAt: Date.now(),
            errorMessage: "Cannot read properties of undefined (reading 'addEventListener')",
          }],
      },
    });

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await flush();

    expect(container.textContent).toContain("连接失败: Cannot read properties of undefined (reading 'addEventListener')");
    const notice = container.querySelector('.status-notice.error');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain("Cannot read properties of undefined (reading 'addEventListener')");
    expect(notice?.querySelector('.status-copy')).not.toBeNull();
  });

  it('keeps the test button disabled until the connection test finishes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    let resolveTest: ((value: Awaited<ReturnType<typeof spies.probeProfileEndpoints>>) => void) | undefined;
    spies.probeProfileEndpoints.mockImplementationOnce(
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
          results: [{
            endpointId: 'primary',
            status: 'healthy',
            checkedAt: Date.now(),
            modelCount: 1,
          }],
        },
      });
    });
    await flush();

    expect(Boolean(queryByTestId(container, 'provider-test-button').disabled)).toBe(false);
    expect(container.textContent).toContain('连接成功');
  });

  it('marks the suggested endpoint after auto-mode probe without changing persisted preference', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      queryByTestId(container, 'provider-endpoint-add').click();
    });
    const secondInput = queryByTestId(container, 'provider-endpoint-url-1') as HTMLInputElement;
    const secondEndpointId = secondInput.id.replace('provider-endpoint-url-', '');
    spies.probeProfileEndpoints.mockResolvedValueOnce({
      ok: true,
      value: {
        results: [
          { endpointId: 'primary', status: 'healthy', checkedAt: Date.now(), latencyMs: 20, modelCount: 1 },
          { endpointId: secondEndpointId, status: 'healthy', checkedAt: Date.now(), latencyMs: 5, modelCount: 1 },
        ],
        suggestedEndpointId: secondEndpointId,
      },
    });
    await act(async () => {
      changeInput(secondInput, 'https://mock-secondary.local');
    });
    await act(async () => {
      queryByTestId(container, 'provider-selection-mode-auto').click();
    });
    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
    });
    await flush();

    expect(container.querySelector('[data-testid="provider-endpoint-suggested-badge-1"]')?.textContent ?? '').toMatch(/建议|Suggested/);
    expect(spies.saveProviderProfile).not.toHaveBeenCalled();
  });

  it('keeps preferred endpoint radio selection singular across rapid clicks', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      queryByTestId(container, 'provider-endpoint-add').click();
    });
    const secondInput = queryByTestId(container, 'provider-endpoint-url-1') as HTMLInputElement;

    await act(async () => {
      changeInput(secondInput, 'https://mock-secondary.local');
      queryByTestId(container, 'provider-endpoint-preferred-1').click();
      queryByTestId(container, 'provider-endpoint-preferred-0').click();
      queryByTestId(container, 'provider-endpoint-preferred-1').click();
    });
    await flush();

    const checkedPreferred = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"][data-testid^="provider-endpoint-preferred-"]')).filter((input) => input.checked);
    expect(checkedPreferred).toHaveLength(1);
    expect(checkedPreferred[0]?.dataset.testid).toBe('provider-endpoint-preferred-1');
    expect(container.querySelectorAll('[data-testid^="provider-endpoint-preferred-dot-"]')).toHaveLength(1);

    await act(async () => {
      queryByTestId(container, 'provider-save-button').click();
    });

    const savedConnection = spies.saveProviderProfile.mock.calls[0]?.[0].config.connection as {
      readonly preferredEndpointId?: string;
      readonly endpoints: readonly { readonly id: string; readonly url: string }[];
    };
    const secondEndpoint = savedConnection.endpoints.find((endpoint) => endpoint.url === 'https://mock-secondary.local');
    expect(secondEndpoint).toBeDefined();
    expect(savedConnection.preferredEndpointId).toBe(secondEndpoint?.id);
  });

  it('disables draft controls while a connection test is pending', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    let resolveTest: ((value: Awaited<ReturnType<typeof spies.probeProfileEndpoints>>) => void) | undefined;
    spies.probeProfileEndpoints.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTest = resolve;
        }),
    );

    await act(async () => {
      queryByTestId(container, 'provider-test-button').click();
      await Promise.resolve();
    });

    expect((queryByTestId(container, 'provider-endpoint-url-0') as HTMLInputElement).disabled).toBe(true);
    expect((queryByTestId(container, 'provider-alias-input') as HTMLInputElement).disabled).toBe(true);

    await act(async () => {
      resolveTest?.({
        ok: true,
        value: {
          results: [{ endpointId: 'primary', status: 'healthy', checkedAt: Date.now(), modelCount: 1 }],
        },
      });
    });
    await flush();

    expect((queryByTestId(container, 'provider-endpoint-url-0') as HTMLInputElement).disabled).toBe(false);
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

    expect(container.textContent).toContain('连接成功');
    expect(container.textContent).toMatch(/\d+ ms/);
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

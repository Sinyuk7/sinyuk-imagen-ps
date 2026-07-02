import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDetailPage } from '../src/shared/ui/pages/settings-detail-page';
import { createFakeServices, fakeOptimizerProfile, fakeProfile } from './fakes';
import { TestAppProviders } from './render-helpers';
import type { UxpFlightRecorder } from '../src/host/uxp-log-sink';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  delete globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__;
  delete globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

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

async function renderDetail(container: HTMLElement, onProfilesChanged = vi.fn(async () => undefined)) {
  const services = createFakeServices();
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TestAppProviders services={services.services}>
        <SettingsDetailPage
          onNav={vi.fn()}
          profileId="mock-profile"
          onProfilesChanged={onProfilesChanged}
        />
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
  return { ...services, onProfilesChanged };
}

async function renderOptimizerDetail(container: HTMLElement, onProfilesChanged = vi.fn(async () => undefined)) {
  const services = createFakeServices();
  services.spies.getProviderProfile.mockResolvedValue({
    ok: true as const,
    value: fakeOptimizerProfile,
  });
  services.spies.listProfileModels.mockResolvedValue({
    ok: true as const,
    value: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1-mini' }],
  });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TestAppProviders services={services.services}>
        <SettingsDetailPage
          onNav={vi.fn()}
          profileId="__prompt-optimizer__"
          onProfilesChanged={onProfilesChanged}
        />
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
  return { ...services, onProfilesChanged };
}

function installFlightRecorder(): Array<{ readonly event: string; readonly attrs?: Record<string, unknown> }> {
  const records: Array<{ readonly event: string; readonly attrs?: Record<string, unknown> }> = [];
  const recorder: UxpFlightRecorder = {
    async checkpoint(event, attrs) {
      records.push({ event, attrs });
    },
    async fail(event, _error, attrs) {
      records.push({ event, attrs });
    },
  };
  globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__ = recorder;
  return records;
}

function buttonByText(container: HTMLElement, text: string): HTMLElement & { disabled?: boolean } {
  const button = Array.from(container.querySelectorAll<HTMLElement & { disabled?: boolean }>('button')).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`找不到按钮: ${text}`);
  }
  return button;
}

async function switchToCustomModel(container: HTMLElement): Promise<void> {
  await act(async () => {
    buttonByText(container, '使用自定义 model id').click();
  });
  await flush();
}

describe('SettingsDetailPage contract', () => {
  it('saves edited provider profile through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies, onProfilesChanged } = await renderDetail(container);

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

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(
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
    expect(onProfilesChanged).toHaveBeenCalledWith('mock-profile');
  });

  it('merges the saved custom model into the selectable model list', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          defaultModel: 'gpt-image2',
        },
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [{ id: 'gpt-image2' }, { id: 'mock-image-v1' }],
    });
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TestAppProviders services={services.services}>
          <SettingsDetailPage
            onNav={vi.fn()}
            profileId="mock-profile"
            onProfilesChanged={vi.fn(async () => undefined)}
          />
        </TestAppProviders>,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      queryByTestId(container, 'provider-default-model-selector').click();
    });
    await flush();

    expect(container.querySelector('[data-testid="provider-default-model-selector-option-gpt-image2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-default-model-selector-option-mock-image-v1"]')).not.toBeNull();
  });

  it('deletes provider profile through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onNav = vi.fn();
    const onProfilesChanged = vi.fn(async () => undefined);
    const services = createFakeServices();
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TestAppProviders services={services.services}>
          <SettingsDetailPage
            onNav={onNav}
            profileId="mock-profile"
            onProfilesChanged={onProfilesChanged}
          />
        </TestAppProviders>,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-del')!.click();
    });

    expect(services.spies.deleteProviderProfile).toHaveBeenCalledWith('mock-profile');
    expect(onProfilesChanged).toHaveBeenCalledWith(null);
    expect(onNav).toHaveBeenCalledWith('settings');
  });

  it('tests provider profile and refreshes models through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      buttonByText(container, '测试连接').click();
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
      buttonByText(container, '刷新模型列表').click();
    });
    await flush();

    expect(spies.refreshProfileModels).toHaveBeenCalledWith('mock-profile');
  });

  it('renders a single model-list notice container with summary and technical detail', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.listProfileModels.mockResolvedValue({
      ok: false as const,
      error: {
        category: 'validation',
        message: 'Provider implementation "mock" returned malformed discovery payload',
      },
    });
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TestAppProviders services={services.services}>
          <SettingsDetailPage
            onNav={vi.fn()}
            profileId="mock-profile"
            onProfilesChanged={vi.fn(async () => undefined)}
          />
        </TestAppProviders>,
      );
    });
    await flush();
    await flush();

    const noticeHost = queryByTestId(container, 'provider-model-list-notice');
    expect(noticeHost.textContent).toContain('模型列表不可用');
    expect(noticeHost.textContent).toContain('Provider implementation "mock" returned malformed discovery payload');
    expect(container.querySelectorAll('[data-testid="provider-model-list-notice"]')).toHaveLength(1);
  });

  it('marks the preferred endpoint with a semantic dot instead of a preferred text badge', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    expect(container.querySelector('[data-testid="provider-endpoint-preferred-dot-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-endpoint-preferred-badge-0"]')).toBeNull();
  });

  it('keeps detail delete as a compact solid icon action', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const button = queryByTestId(container, 'provider-delete-button');
    const host = button.closest('.ui-icon-button-host');
    const overlay = host?.querySelector('.ui-icon-button-overlay');
    expect(button.getAttribute('data-variant')).toBe('negative');
    expect(button.textContent?.trim()).toBe('');
    expect(button.className).toContain('btn-del');
    expect(button.className).toContain('ui-icon-button--compact-square');
    expect(host?.className).toContain('ui-icon-button-host--compact-square');
    expect(overlay?.className).toContain('ui-icon-button-overlay--compact-square');
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

  it('tests Prompt Optimizer through the dedicated validation command', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies, onProfilesChanged } = await renderOptimizerDetail(container);

    await act(async () => {
      buttonByText(container, '测试连接').click();
    });
    await flush();

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: '__prompt-optimizer__',
        providerId: 'prompt-optimize',
      }),
    );
    expect(spies.validatePromptOptimizerProfile).toHaveBeenCalledWith('__prompt-optimizer__');
    expect(spies.testProviderProfile).not.toHaveBeenCalled();
    expect(spies.probeProfileEndpoints).not.toHaveBeenCalled();
    expect(onProfilesChanged).toHaveBeenCalledWith('__prompt-optimizer__');
    expect(container.textContent).toContain('连接成功');
  });

  it('renders Prompt Optimizer instruction as a styled multiline field inside its own section', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderOptimizerDetail(container);

    const textarea = container.querySelector<HTMLTextAreaElement>('[data-testid="provider-instruction-input"]');
    expect(textarea).not.toBeNull();
    expect(textarea?.tagName).toBe('TEXTAREA');
    expect(textarea?.getAttribute('rows')).toBe('5');
    expect(textarea?.className).toContain('field-textarea-input');
    expect(container.textContent).toContain('提示词行为');
    expect(container.textContent).toContain('Instruction');
  });

  it('keeps a single default-model trigger and a separate custom model field for Prompt Optimizer', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderOptimizerDetail(container);

    const selector = container.querySelectorAll('[data-testid="provider-default-model-selector"]');
    const textInput = container.querySelectorAll('[data-testid="provider-default-model-input"]');
    expect(selector).toHaveLength(1);
    expect(textInput).toHaveLength(0);
    expect(selector[0]?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(container.textContent).toContain('gpt-4o-mini');
    expect(container.textContent).toContain('使用自定义 model id');
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
      buttonByText(container, '测试连接').click();
    });
    await flush();

    expect(container.textContent).toContain("连接失败: Cannot read properties of undefined (reading 'addEventListener')");
    expect(container.textContent).not.toContain('已保存');
    expect(container.querySelector('.status-notice.error')).not.toBeNull();
    expect(container.querySelector('.status-copy')).not.toBeNull();
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
      buttonByText(container, '测试连接').click();
      await Promise.resolve();
    });

    expect(buttonByText(container, '测试中...').disabled).toBe(true);

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

    expect(Boolean(buttonByText(container, '测试连接').disabled)).toBe(false);
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
      buttonByText(container, '测试连接').click();
    });
    await flush();

    expect(container.querySelector('[data-testid="provider-endpoint-suggested-badge-1"]')?.textContent ?? '').toMatch(/建议|Suggested/);
    expect(spies.saveProviderProfile).not.toHaveBeenCalled();
  });

  it('renders the test button as a centered icon and label combo with nearby test result meta', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetail(container);

    const button = container.querySelector('[data-testid="provider-test-button"]');
    expect(button?.querySelector('.ui-button-content')).not.toBeNull();
    expect(button?.querySelector('[data-icon-name="check"]')).not.toBeNull();

    await act(async () => {
      buttonByText(container, '测试连接').click();
    });
    await flush();

    expect(container.textContent).toContain('最近一次测试结果');
    expect(container.textContent).toMatch(/最近一次测试结果 · \d+ ms/);
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

  it('writes sanitized UI save checkpoints without form secrets or provider values', async () => {
    const records = installFlightRecorder();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { onProfilesChanged } = await renderDetail(container);

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-alias-input'), 'Sensitive Alias Should Not Log');
      changeInput(queryByTestId(container, 'provider-endpoint-url-0'), 'https://secret.example.local/path');
      changeInput(queryByTestId(container, 'provider-api-key-input'), 'sk_live_secret_should_not_log');
    });
    await switchToCustomModel(container);
    await act(async () => {
      changeInput(queryByTestId(container, 'provider-default-model-input'), 'mock-image-v2-secret-name');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });
    await flush();

    expect(onProfilesChanged).toHaveBeenCalledWith('mock-profile');
    const events = records.map((record) => record.event);
    expect(events).toEqual(expect.arrayContaining([
      'uxp.ui.settings_detail.save.entered',
      'uxp.ui.settings_detail.save.busy_set',
      'uxp.ui.settings_detail.persist.input_prepared',
      'uxp.ui.profile_detail.save.before_command',
      'uxp.ui.profile_detail.save.after_command',
      'uxp.ui.profile_detail.save.before_set_profile',
      'uxp.ui.profile_detail.save.after_set_profile',
      'uxp.ui.settings_detail.save.after_persist',
      'uxp.ui.settings_detail.save.before_success_status',
      'uxp.ui.settings_detail.save.after_success_status',
      'uxp.ui.settings_detail.save.before_profiles_changed',
      'uxp.ui.settings_detail.save.after_profiles_changed',
      'uxp.ui.settings_detail.save.before_busy_clear',
      'uxp.ui.settings_detail.save.after_busy_clear',
    ]));
    expect(events.indexOf('uxp.ui.settings_detail.save.before_profiles_changed')).toBeLessThan(
      events.indexOf('uxp.ui.settings_detail.save.after_profiles_changed'),
    );

    const text = JSON.stringify(records);
    expect(text).toContain('"hasDirtyCredential":true');
    expect(text).toContain('"modelIdLength":25');
    expect(text).not.toContain('Sensitive Alias Should Not Log');
    expect(text).not.toContain('https://secret.example.local');
    expect(text).not.toContain('sk_live_secret_should_not_log');
    expect(text).not.toContain('mock-image-v2-secret-name');
    expect(text).not.toContain('secret:provider-profile');
  });

  it('can disable UI flight recorder with diagnostic flag without changing save callback', async () => {
    const records = installFlightRecorder();
    globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__ = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { onProfilesChanged } = await renderDetail(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });
    await flush();

    expect(onProfilesChanged).toHaveBeenCalledWith('mock-profile');
    expect(records).toEqual([]);
  });
});

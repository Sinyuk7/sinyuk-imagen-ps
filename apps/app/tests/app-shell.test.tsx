import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/shared/ui/app-shell';
import { createFakeServices, fakeProfile } from './fakes';
import type { Job } from '@imagen-ps/application';
import type { UxpFlightRecorder } from '../src/host/uxp-log-sink';
import { NON_UXP_RUNTIME_CAPABILITIES } from '../src/shared/ports/host-port';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  window.history.replaceState(null, '', '/');
  delete globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

function iconSelectValue(container: HTMLElement, selector: string): string {
  return container.querySelector<HTMLElement>(selector)?.closest('.ui-overlay-icon-host')?.querySelector<HTMLElement>('.cmp-chip-overlay-value-icon, .cmp-chip-overlay-value-text')?.textContent ?? '';
}

function deferred<T>(): { readonly promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
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

function failedJob(input: Record<string, unknown>): Job {
  return {
    id: 'job-history-failed',
    status: 'failed',
    input,
    output: undefined,
    error: { category: 'provider', message: 'provider failed' },
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
  };
}

describe('AppShell', () => {
  it('mounts the React shell with injected services', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'zh-CN',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Mock Profile');
    expect(container.textContent).toContain('mock-image-v1');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('reconciles stale running durable tasks once on startup', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'zh-CN',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    expect(spies.reconcileStaleRunningTaskRecords).toHaveBeenCalledTimes(1);
    expect(spies.reconcileStaleRunningTaskRecords).toHaveBeenCalledWith([]);
  });

  it('restores a persisted active image profile on startup instead of defaulting to the first profile', async () => {
    const { services } = createFakeServices({
      profiles: [
        {
          ...fakeProfile,
          profileId: 'first-profile',
          displayName: 'First Profile',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
        {
          ...fakeProfile,
          profileId: 'saved-profile',
          displayName: 'Saved Profile',
          updatedAt: '2026-06-15T00:00:01.000Z',
        },
      ],
      activeImageProfileId: 'saved-profile',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Saved Profile');
    expect(container.textContent).not.toContain('First Profilemock-image-v1');
  });

  it('writes active image profile selection back to app-local persistent store', async () => {
    const { services } = createFakeServices({
      profiles: [
        {
          ...fakeProfile,
          profileId: 'first-profile',
          displayName: 'First Profile',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
        {
          ...fakeProfile,
          profileId: 'second-profile',
          displayName: 'Second Profile',
          updatedAt: '2026-06-15T00:00:01.000Z',
        },
      ],
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="profile-menu-option-second-profile"]')?.click();
    });
    await flush();
    await flush();

    expect(await services.activeImageProfile.load()).toBe('second-profile');
  });

  it('does not switch the active image provider after adding another provider unless opted in', async () => {
    const { services, spies } = createFakeServices({ activeImageProfileId: 'mock-profile' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="providers-add-button"]')?.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="provider-type-mock"]')).toBeNull();
    await act(async () => {
      changeInput(
        container.querySelector<HTMLInputElement>('[data-testid="provider-endpoint-detect-input"]')!,
        'https://mock.local/images/generations',
      );
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="provider-alias-input"]')!, 'Second Mock');
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="provider-api-key-input"]')!, 'mock-key');
    });
    await flush();
    expect(container.querySelector('[data-testid="provider-use-after-saving"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="provider-save-button"]')?.click();
    });
    await flush();
    await flush();

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
      apiFormat: 'openai-images',
      displayName: 'Second Mock',
    }));
    expect(container.textContent).toContain('Providers');
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Saved');
    expect(await services.activeImageProfile.load()).toBe('mock-profile');
  });

  it('reloads durable history after a running round reaches terminal state', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'zh-CN',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    const initialCalls = spies.listTaskRecords.mock.calls.length;

    const textarea = container.querySelector<HTMLTextAreaElement>('.cmp-ta');
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea!, 'refresh history');
      textarea!.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!.click();
    });
    await flush();
    await flush();

    expect(spies.listTaskRecords.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('fills the composer from a failed current-session round retried on history page', async () => {
    const { services, spies } = createFakeServices();
    spies.submitJob.mockImplementation(async (input: { input: Record<string, unknown> }) => ({
      ok: true as const,
      value: failedJob(input.input),
    }));
    spies.putTaskRecord.mockResolvedValue(undefined);
    vi.mocked(services.commands.retryJob).mockImplementation(async () => ({
      ok: true as const,
      value: failedJob({}),
    }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'zh-CN',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    const textarea = container.querySelector<HTMLTextAreaElement>('.cmp-ta');
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea!, 'history failed prompt');
      textarea!.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!.click();
    });
    await flush();
    await flush();

    expect(spies.submitJob).toHaveBeenCalledTimes(1);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="main-history-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid^="history-retry-button-"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector<HTMLTextAreaElement>('.cmp-ta')?.value).toBe('history failed prompt');
    expect(spies.submitJob).toHaveBeenCalledTimes(1);
    expect(services.commands.retryJob).not.toHaveBeenCalled();
  });

  it('keeps shared composer draft state across main -> settings -> main navigation', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'zh-CN',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'persist shared draft');
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')?.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="attach-upload-option"]')?.click();
    });
    await flush();

    expect(container.querySelector<HTMLTextAreaElement>('.cmp-ta')?.value).toBe('persist shared draft');
    expect(container.querySelectorAll('.att-thumb')).toHaveLength(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="providers-back-button"]')?.click();
    });
    await flush();

    expect(container.querySelector<HTMLTextAreaElement>('.cmp-ta')?.value).toBe('persist shared draft');
    expect(container.querySelectorAll('.att-thumb')).toHaveLength(1);
  });

  it('renders app content in English when host locale is English', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Current session');
    expect(container.textContent).toContain('What shall we create today? ✨');
    expect(document.documentElement.lang).toBe('en');
  });

  it('records post-save profile reload and selected profile update checkpoints', async () => {
    const records = installFlightRecorder();
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      const settingsButton = container.querySelector<HTMLButtonElement>('[data-testid="main-providers-button"]');
      settingsButton?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-row-mock-profile"]')!.click();
    });
    await flush();
    await flush();
    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="provider-alias-input"]')!, 'Updated Alias');
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });
    await flush();

    const events = records.map((record) => record.event);
    const beforeReload = events.indexOf('uxp.ui.app_shell.profiles_changed.before_reload');
    const afterReload = events.indexOf('uxp.ui.app_shell.profiles_changed.after_reload');
    const beforeSelect = events.indexOf('uxp.ui.app_shell.profiles_changed.before_select_profile');
    const afterSelect = events.indexOf('uxp.ui.app_shell.profiles_changed.after_select_profile');

    expect(beforeReload).toBeGreaterThanOrEqual(0);
    expect(afterReload).toBeGreaterThan(beforeReload);
    expect(beforeSelect).toBeGreaterThan(afterReload);
    expect(afterSelect).toBeGreaterThan(beforeSelect);
    expect(JSON.stringify(records)).not.toContain('secret:provider-profile');
  });

  it('reports history placement unavailable when the runtime cannot place assets', async () => {
    const { services, spies } = createFakeServices();
    const chromeLikeServices = {
      ...services,
      host: {
        ...services.host,
        capabilities: NON_UXP_RUNTIME_CAPABILITIES,
      },
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'chrome-browser',
            app: { stage: 'chrome-shell', host: 'chrome-browser', services: ['commands', 'host'] },
            locale: 'en',
            services: chromeLikeServices,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="main-history-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="history-place-button-task-history-1"]')?.click();
    });
    await flush();

    expect(spies.placeAssetOnCanvas).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Resource unavailable');
  });

  it('writes root panel semantic size modes and disconnects the root observer on unmount', async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    const disconnect = vi.fn();
    const observe = vi.fn();
    let resizeCallback: ResizeObserverCallback | undefined;

    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }

    // @ts-expect-error test stub
    globalThis.ResizeObserver = MockResizeObserver;

    try {
      const { services } = createFakeServices();
      const container = document.createElement('div');
      container.style.width = '300px';
      container.style.height = '420px';
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root!.render(
          <AppShell
            host={{
              kind: 'photoshop-uxp',
              app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
              locale: 'en',
              services,
              dispose: () => undefined,
            }}
          />,
        );
      });
      await flush();
      await flush();

      const panel = container.querySelector<HTMLDivElement>('.panel');
      expect(panel).not.toBeNull();
      expect(observe).toHaveBeenCalledWith(panel);

      resizeCallback?.(
        [{
          target: panel!,
          contentRect: { width: 300, height: 420 } as DOMRectReadOnly,
        } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      expect(panel?.getAttribute('data-panel-width-mode')).toBe('compact');
      expect(panel?.getAttribute('data-panel-height-mode')).toBe('short');

      resizeCallback?.(
        [{
          target: panel!,
          contentRect: { width: 600, height: 800 } as DOMRectReadOnly,
        } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      expect(panel?.getAttribute('data-panel-width-mode')).toBe('wide');
      expect(panel?.getAttribute('data-panel-height-mode')).toBe('normal');

      await act(async () => {
        root!.unmount();
      });
      root = undefined;

      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('does not override Photoshop UXP host theme with a root data attribute', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    expect(container.querySelector<HTMLDivElement>('.panel')?.hasAttribute('data-app-theme')).toBe(false);
  });

  it('applies Chrome theme query override to the root panel', async () => {
    window.history.replaceState(null, '', '/?theme=light');
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    expect(container.querySelector<HTMLDivElement>('.panel')?.getAttribute('data-app-theme')).toBe('light');
  });

  it('writes main-page output size changes back into global generation settings', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-output-size-selector"]')?.click();
    });
    await flush();
    await act(async () => {
      const option = Array.from(
        document.body.querySelectorAll<HTMLElement>('[data-testid^="composer-output-size-selector-option-"]'),
      ).find((element) => element.textContent?.includes('4K'));
      option?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-generation-settings-row"]')?.click();
    });
    await flush();
    await flush();

    expect(iconSelectValue(container, '[data-testid="global-output-size-selector"]')).toContain('4K');
  });

  it('uses the shared composer operation when global settings evaluates output-size availability', async () => {
    const { services } = createFakeServices({
      profiles: [{
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          defaultModel: 'image-edit-1k',
        },
      }],
    });
    vi.mocked(services.commands.listProfileModels).mockResolvedValue({
      ok: true as const,
      value: [{
        id: 'image-edit-1k',
        supportStatus: 'selectable',
        capabilities: {
          operations: {
            textToImage: { support: 'supported', sizePresets: ['1k', '2k', '4k'] },
            imageEdit: { support: 'supported', sizePresets: ['1k'] },
          },
        },
      }],
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'zh-CN',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')?.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="attach-upload-option"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-generation-settings-row"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-output-size-selector"]')?.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="global-output-size-selector-option-4k"]')?.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('此模型不支持 4K');
    expect(iconSelectValue(container, '[data-testid="global-output-size-selector"]')).toContain('1K');
  });

  it('writes output-size auto-fallback back into global settings after shared draft context switches operation', async () => {
    const { services } = createFakeServices({
      generationSettings: {
        outputSizePreset: '4k',
      },
      profiles: [{
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          defaultModel: 'image-edit-1k',
        },
      }],
    });
    vi.mocked(services.commands.listProfileModels).mockResolvedValue({
      ok: true as const,
      value: [{
        id: 'image-edit-1k',
        supportStatus: 'selectable',
        capabilities: {
          operations: {
            textToImage: { support: 'supported', sizePresets: ['1k', '2k', '4k'] },
            imageEdit: { support: 'supported', sizePresets: ['1k'] },
          },
        },
      }],
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'zh-CN',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    expect(iconSelectValue(container, '[data-testid="composer-output-size-selector"]')).toContain('4K');

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')?.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="attach-upload-option"]')?.click();
    });
    await flush();
    await flush();

    expect(iconSelectValue(container, '[data-testid="composer-output-size-selector"]')).toContain('1K');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-generation-settings-row"]')?.click();
    });
    await flush();
    await flush();

    expect(iconSelectValue(container, '[data-testid="global-output-size-selector"]')).toContain('1K');
  });

  it('updates main-page model after settings saves a new custom default model', async () => {
    const { services, spies } = createFakeServices({
      profiles: [{
        profileId: 'mock-profile',
        providerId: 'mock',
        displayName: 'Mock Profile',
        enabled: true,
        config: {
          providerId: 'mock',
          displayName: 'Mock Profile',
          family: 'image-endpoint',
          baseURL: 'https://mock.local',
          defaultModel: 'gpt-image2',
        },
        secretRefs: {
          apiKey: 'secret:provider-profile:mock-profile:apiKey',
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      }],
    });
    spies.listProfileModels.mockImplementation(async () => {
      const profiles = await services.commands.listProviderProfiles();
      const defaultModel = profiles.ok ? String(profiles.value[0]?.config.defaultModel ?? '') : '';
      return {
        ok: true as const,
        value: defaultModel ? [{ id: defaultModel }, { id: 'mock-image-v1' }] : [{ id: 'mock-image-v1' }],
      };
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    expect(iconSelectValue(container, '[data-testid="main-model-selector"]')).toContain('gpt-image2');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-row-mock-profile"]')?.click();
    });
    await flush();
    await flush();
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[data-testid="provider-use-custom-model-checkbox"]')?.click();
    });
    await flush();

    const modelInput = container.querySelector<HTMLInputElement>('[data-testid="provider-default-model-input"]');
    expect(modelInput).not.toBeNull();
    await act(async () => {
      if (modelInput) {
        changeInput(modelInput, 'gpt-image3');
      }
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="provider-save-button"]')?.click();
    });
    await flush();
    await flush();

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        defaultModel: 'gpt-image3',
      }),
    }));
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Saved');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="providers-back-button"]')?.click();
    });
    await flush();

    expect(iconSelectValue(container, '[data-testid="main-model-selector"]')).toContain('gpt-image3');
  });

  it('ignores stale profile model responses after switching profiles', async () => {
    type ListProfileModelsResult = { readonly ok: true; readonly value: readonly { readonly id: string }[] };
    const slowFirstProfileModels = deferred<ListProfileModelsResult>();
    const { services, spies } = createFakeServices({
      profiles: [
        {
          ...fakeProfile,
          profileId: 'profile-a',
          displayName: 'Provider A',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
        {
          ...fakeProfile,
          profileId: 'profile-b',
          displayName: 'Provider B',
          config: {
            ...fakeProfile.config,
            defaultModel: 'model-b',
          },
          updatedAt: '2026-06-15T00:00:01.000Z',
        },
      ],
      activeImageProfileId: 'profile-a',
    });
    spies.listProfileModels.mockImplementation(async (profileId: string) => {
      if (profileId === 'profile-a') {
        return slowFirstProfileModels.promise;
      }
      return { ok: true as const, value: [{ id: 'model-b' }] };
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppShell
          host={{
            kind: 'photoshop-uxp',
            app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
            locale: 'en',
            services,
            dispose: () => undefined,
          }}
        />,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="profile-menu-option-profile-b"]')!.click();
    });
    await flush();
    await flush();

    expect(iconSelectValue(container, '[data-testid="main-model-selector"]')).toContain('model-b');

    await act(async () => {
      slowFirstProfileModels.resolve({ ok: true as const, value: [{ id: 'model-a' }] });
      await Promise.resolve();
    });
    await flush();

    expect(iconSelectValue(container, '[data-testid="main-model-selector"]')).toContain('model-b');
    expect(iconSelectValue(container, '[data-testid="main-model-selector"]')).not.toContain('model-a');
  });
});

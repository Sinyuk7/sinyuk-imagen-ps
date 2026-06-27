import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../src/shared/ui/app-shell';
import { createFakeServices } from './fakes';
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
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
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
    expect(container.textContent).toContain('What would you like to create? Pick a profile, describe your image, and send.');
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
      container.querySelector<HTMLElement>('.prov-row')!.click();
    });
    await flush();
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

  it('keeps Prompt Optimizer selected in settings detail instead of falling back to the first image profile', async () => {
    const { services, spies } = createFakeServices();
    spies.getProviderProfile.mockImplementation(async (profileId: string) => ({
      ok: true as const,
      value: profileId === '__prompt-optimizer__'
        ? {
            profileId: '__prompt-optimizer__',
            providerId: 'prompt-optimize',
            displayName: 'Prompt Optimizer',
            enabled: false,
            config: {
              providerId: 'prompt-optimize',
              displayName: 'Prompt Optimizer',
              family: 'prompt-optimize',
              baseURL: 'https://openrouter.ai/api/v1',
              defaultModel: 'gpt-4o-mini',
              instruction: 'Rewrite the prompt.',
              testPrompt: 'test',
            },
            createdAt: '2026-06-15T00:00:00.000Z',
            updatedAt: '2026-06-15T00:00:00.000Z',
          }
        : {
            profileId: 'mock-profile',
            providerId: 'mock',
            displayName: 'Mock Profile',
            enabled: true,
            config: {
              providerId: 'mock',
              displayName: 'Mock Profile',
              family: 'image-endpoint',
              baseURL: 'https://mock.local',
              defaultModel: 'mock-image-v1',
            },
            secretRefs: {
              apiKey: 'secret:provider-profile:mock-profile:apiKey',
            },
            createdAt: '2026-06-15T00:00:00.000Z',
            updatedAt: '2026-06-15T00:00:00.000Z',
          },
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
      container.querySelector<HTMLElement>('[data-testid="provider-row-__prompt-optimizer__"]')?.click();
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Prompt Optimizer');
    expect(container.querySelector<HTMLInputElement>('[data-testid="provider-base-url-input"]')?.value).toBe('https://openrouter.ai/api/v1');
    expect(container.querySelector<HTMLInputElement>('[data-testid="provider-default-model-input"]')?.value).toBe('gpt-4o-mini');
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="provider-instruction-input"]')?.value).toBe('Rewrite the prompt.');
  });
});

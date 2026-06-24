import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../src/ui/app-shell';
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
    expect(container.textContent).toContain('Enter a prompt to submit a real job through the application layer.');
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
      const settingsButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
        button.innerHTML.includes('settings.png'),
      );
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
});

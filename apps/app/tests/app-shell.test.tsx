import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../src/ui/app-shell';
import { createFakeServices } from './fakes';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
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
});

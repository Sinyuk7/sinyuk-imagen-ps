import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createChromeAppShell } from '../src/composition/chrome/create-chrome-app-shell';
import { createMemoryIndexedDbBackend } from '../src/adapters/chrome/indexed-db-storage';
import { AppShell } from '../src/shared/ui/app-shell';

let root: Root | undefined;
let host: ReturnType<typeof createChromeAppShell> | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  host?.dispose();
  root = undefined;
  host = undefined;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Chrome shared UI shell', () => {
  it('mounts the shared AppShell with Chrome adapters and simulator capabilities', async () => {
    host = createChromeAppShell({ backend: createMemoryIndexedDbBackend() });
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<AppShell host={host!} />);
    });
    await flush();
    await flush();

    expect(host.app.host).toBe('chrome-browser');
    expect(host.services.host.capabilities.runtime).toBe('chrome-browser');
    expect(await host.services.host.listLayers()).toHaveLength(10);
    expect(container.textContent).toContain('Current session');
    expect(container.textContent).toContain('Enter a prompt to submit a real job through the application layer.');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { createChromeAppShell } from '../../../src/composition/chrome/create-chrome-app-shell';
import { createMemoryIndexedDbBackend } from '../../../src/adapters/chrome/indexed-db-storage';
import type { AppShellHost } from '../../../src/shared/ui/app-shell';

let shell: AppShellHost | undefined;

describe('Chrome ComfyUI runtime composition', () => {
  afterEach(() => {
    shell?.dispose();
    shell = undefined;
  });

  it('shares persistent repositories between management and the registered backend', async () => {
    const backend = createMemoryIndexedDbBackend();
    shell = createChromeAppShell({ backend });

    await shell.services.comfyUi.saveConnection({
      connectionId: 'connection-a',
      displayName: 'Studio ComfyUI',
      origin: 'https://comfy.example.test',
    });
    await expect(shell.services.comfyUi.listConnections()).resolves.toMatchObject([{
      connectionId: 'connection-a',
      observationTimeoutMs: 300_000,
    }]);
    expect(shell.services.generationBackends?.map((item) => item.id)).toEqual(['provider', 'comfyui']);

    shell.dispose();
    shell = createChromeAppShell({ backend });
    await expect(shell.services.comfyUi.getConnection('connection-a')).resolves.toMatchObject({
      displayName: 'Studio ComfyUI',
    });
  });
});

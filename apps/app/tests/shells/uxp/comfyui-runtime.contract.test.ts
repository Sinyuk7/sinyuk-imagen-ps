import { afterEach, describe, expect, it } from 'vitest';
import { createPluginHostShell, type PluginHostShell } from '../../../src/shells/uxp/create-plugin-host-shell';

let shell: PluginHostShell | undefined;

describe('UXP ComfyUI runtime composition', () => {
  afterEach(() => {
    shell?.dispose();
    shell = undefined;
  });

  it('registers management and the ComfyUI backend through host-safe fallbacks', async () => {
    shell = createPluginHostShell();

    expect(shell.services.generationBackends?.map((item) => item.id)).toEqual(['provider', 'comfyui']);
    await expect(shell.services.comfyUi.listConnections()).resolves.toEqual([]);
  });
});

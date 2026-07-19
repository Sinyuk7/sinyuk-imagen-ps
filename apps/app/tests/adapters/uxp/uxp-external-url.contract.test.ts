import { describe, expect, it, vi } from 'vitest';
import { createUxpExternalUrlPort } from '../../../src/adapters/uxp/uxp-external-url';

describe('UXP external URL adapter', () => {
  it('opens an HTTPS URL through shell.openExternal', async () => {
    const openExternal = vi.fn(async () => '');
    const port = createUxpExternalUrlPort({ uxp: { shell: { openExternal } } });

    await port.open('https://comfy.example.test/workflows/demo', 'Open workflow in ComfyUI');

    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(
      'https://comfy.example.test/workflows/demo',
      'Open workflow in ComfyUI',
    );
  });

  it('rejects unsupported schemes before calling UXP', async () => {
    const openExternal = vi.fn(async () => '');
    const port = createUxpExternalUrlPort({ uxp: { shell: { openExternal } } });

    await expect(port.open('file:///tmp/workflow.json')).rejects.toThrow('Only HTTP(S) URLs');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('surfaces the bounded UXP error result', async () => {
    const port = createUxpExternalUrlPort({
      uxp: { shell: { openExternal: vi.fn(async () => 'Permission denied') } },
    });

    await expect(port.open('http://127.0.0.1:8188')).rejects.toThrow('Permission denied');
  });
});

import { describe, expect, it } from 'vitest';
import { createUxpComfyUiStateRepository } from '../../../src/adapters/uxp/uxp-comfyui-persistence';

describe('UXP ComfyUI singleton state', () => {
  it('keeps state in the exact allowlist', async () => {
    const state = createUxpComfyUiStateRepository({});
    await state.save({ baseUrl: 'http://127.0.0.1:8188/comfy', selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
    await expect(state.load()).resolves.toEqual({ baseUrl: 'http://127.0.0.1:8188/comfy', selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
  });
});

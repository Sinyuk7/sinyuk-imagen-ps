import { describe, expect, it } from 'vitest';
import { createMemoryIndexedDbBackend } from '../../../src/adapters/chrome/indexed-db-storage';
import { createChromeComfyUiStateRepository } from '../../../src/adapters/chrome/chrome-comfyui-persistence';

describe('Chrome ComfyUI singleton state', () => {
  it('persists only the durable allowlist', async () => {
    const backend = createMemoryIndexedDbBackend();
    const state = createChromeComfyUiStateRepository({ backend });
    await state.save({ baseUrl: 'https://example.test/comfy', selectedWorkflowId: 'wf-1', ambiguousMappingsByRevision: {} });
    await expect(state.load()).resolves.toEqual({ baseUrl: 'https://example.test/comfy', selectedWorkflowId: 'wf-1', ambiguousMappingsByRevision: {} });
    await expect(backend.get('comfyUiState', 'current')).resolves.toBeTruthy();
  });

  it('rejects extra persisted fields', async () => {
    const backend = createMemoryIndexedDbBackend({ initial: { comfyUiState: [{ key: 'current', value: { schemaVersion: 1, value: { baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {}, workflowJson: '{}' } } }] } });
    await expect(createChromeComfyUiStateRepository({ backend }).load()).resolves.toBeUndefined();
  });
});

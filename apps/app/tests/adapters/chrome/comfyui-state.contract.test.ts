import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserIndexedDbBackend,
  createMemoryIndexedDbBackend,
  type ChromeKeyValueBackend,
} from '../../../src/adapters/chrome/indexed-db-storage';
import { createChromeComfyUiStateRepository } from '../../../src/adapters/chrome/chrome-comfyui-persistence';

const stateA = {
  baseUrl: 'https://a.example.test/comfy',
  selectedWorkflowId: 'wf-a',
  ambiguousMappingsByRevision: {},
} as const;

const stateB = {
  baseUrl: 'https://b.example.test/comfy',
  selectedWorkflowId: 'wf-b',
  ambiguousMappingsByRevision: {},
} as const;

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

  it('commits compare-and-save through the atomic backend seam', async () => {
    const backend = createMemoryIndexedDbBackend();
    const state = createChromeComfyUiStateRepository({ backend });
    await state.save(stateA);

    await expect(state.compareAndSave({
      ambiguousMappingsByRevision: {},
      selectedWorkflowId: 'wf-a',
      baseUrl: 'https://a.example.test/comfy',
    }, stateB)).resolves.toBe('committed');
    await expect(state.load()).resolves.toEqual(stateB);

    const record = await backend.get<Record<string, unknown>>('comfyUiState', 'current');
    expect(Object.keys(record ?? {}).sort()).toEqual(['schemaVersion', 'value']);
    expect(Object.keys((record?.value ?? {}) as Record<string, unknown>).sort()).toEqual([
      'ambiguousMappingsByRevision',
      'baseUrl',
      'selectedWorkflowId',
    ]);
  });

  it('returns conflict without changing the authoritative record', async () => {
    const backend = createMemoryIndexedDbBackend();
    const state = createChromeComfyUiStateRepository({ backend });
    await state.save(stateA);

    await expect(state.compareAndSave(undefined, stateB)).resolves.toBe('conflict');
    await expect(state.load()).resolves.toEqual(stateA);
  });

  it('passes abort ownership into the atomic seam and preserves current state', async () => {
    const memory = createMemoryIndexedDbBackend();
    let observedSignal: AbortSignal | undefined;
    const backend: ChromeKeyValueBackend = {
      ...memory,
      async atomicCompareAndPut(_store, _key, _next, _matches, signal) {
        observedSignal = signal;
        return signal?.aborted ? 'aborted' : 'committed';
      },
    };
    const state = createChromeComfyUiStateRepository({ backend });
    await state.save(stateA);
    const controller = new AbortController();
    controller.abort();

    await expect(state.compareAndSave(stateA, stateB, controller.signal)).resolves.toBe('aborted');
    expect(observedSignal).toBe(controller.signal);
    await expect(state.load()).resolves.toEqual(stateA);
  });

  it('aborts an in-flight browser IndexedDB transaction', async () => {
    let transactionAbortCount = 0;
    let markTransactionStarted: (() => void) | undefined;
    const transactionStarted = new Promise<void>((resolve) => { markTransactionStarted = resolve; });
    const pendingGetRequest = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
    };
    const transaction = {
      error: null,
      oncomplete: null as ((event: Event) => void) | null,
      onabort: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      objectStore() {
        return {
          get() {
            markTransactionStarted?.();
            return pendingGetRequest;
          },
        };
      },
      abort() {
        transactionAbortCount += 1;
        queueMicrotask(() => transaction.onabort?.(new Event('abort')));
      },
    };
    const database = {
      transaction() {
        return transaction;
      },
    };
    const openRequest = {
      result: database,
      error: null,
      onupgradeneeded: null as ((event: Event) => void) | null,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    };
    vi.stubGlobal('indexedDB', {
      open() {
        queueMicrotask(() => openRequest.onsuccess?.(new Event('success')));
        return openRequest as unknown as IDBOpenDBRequest;
      },
    } as unknown as IDBFactory);

    try {
      const backend = createBrowserIndexedDbBackend({ databaseName: 'abort-contract' });
      const controller = new AbortController();
      const commit = backend.atomicCompareAndPut('comfyUiState', 'current', stateB, () => true, controller.signal);
      await transactionStarted;
      controller.abort();

      await expect(commit).resolves.toBe('aborted');
      expect(transactionAbortCount).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces transaction errors without overwriting current state', async () => {
    const memory = createMemoryIndexedDbBackend();
    const backend: ChromeKeyValueBackend = {
      ...memory,
      async atomicCompareAndPut() {
        throw new Error('synthetic IndexedDB transaction failure');
      },
    };
    const state = createChromeComfyUiStateRepository({ backend });
    await state.save(stateA);

    await expect(state.compareAndSave(stateA, stateB)).rejects.toThrow('synthetic IndexedDB transaction failure');
    await expect(state.load()).resolves.toEqual(stateA);
  });
});

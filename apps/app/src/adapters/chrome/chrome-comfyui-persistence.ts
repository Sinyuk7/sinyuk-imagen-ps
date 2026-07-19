import {
  createComfyUiWorkflowDraftStore,
  createComfyUiWorkflowRuntimeCache,
  normalizePersistedComfyUiState,
  type ComfyUiStateRepository,
  type ComfyUiWorkflowDraftStore,
  type ComfyUiWorkflowRuntimeCache,
  type PersistedComfyUiState,
} from '@imagen-ps/application';
import { createBrowserIndexedDbBackend, type ChromeKeyValueBackend } from './indexed-db-storage';

const STATE_KEY = 'current';
const STATE_SCHEMA_VERSION = 1;

interface PersistedStateRecord {
  readonly schemaVersion: typeof STATE_SCHEMA_VERSION;
  readonly value: PersistedComfyUiState;
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Chrome IndexedDB 中唯一的 ComfyUI durable state adapter。 */
export function createChromeComfyUiStateRepository(options?: {
  readonly backend?: ChromeKeyValueBackend;
}): ComfyUiStateRepository {
  const backend = options?.backend ?? createBrowserIndexedDbBackend();
  return {
    async load() {
      const record = await backend.get<unknown>('comfyUiState', STATE_KEY);
      if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
      const value = record as Record<string, unknown>;
      if (value.schemaVersion !== STATE_SCHEMA_VERSION || !value.value) return undefined;
      try {
        return snapshot(normalizePersistedComfyUiState(value.value));
      } catch {
        return undefined;
      }
    },
    async save(state) {
      const value = normalizePersistedComfyUiState(state);
      const record: PersistedStateRecord = { schemaVersion: STATE_SCHEMA_VERSION, value };
      await backend.put('comfyUiState', STATE_KEY, snapshot(record));
    },
    async clear() {
      await backend.delete('comfyUiState', STATE_KEY);
    },
  };
}

export interface ChromeComfyUiRepositories {
  readonly state: ComfyUiStateRepository;
  readonly cache: ComfyUiWorkflowRuntimeCache;
  readonly drafts: ComfyUiWorkflowDraftStore;
}

/** 创建 Chrome ComfyUI state、runtime cache 与 session draft ports。 */
export function createChromeComfyUiRepositories(options?: {
  readonly backend?: ChromeKeyValueBackend;
}): ChromeComfyUiRepositories {
  return {
    state: createChromeComfyUiStateRepository(options),
    cache: createComfyUiWorkflowRuntimeCache(),
    drafts: createComfyUiWorkflowDraftStore(),
  };
}

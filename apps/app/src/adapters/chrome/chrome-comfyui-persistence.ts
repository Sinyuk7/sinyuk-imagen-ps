import {
  createComfyUiWorkflowDraftStore,
  createComfyUiWorkflowRuntimeCache,
  normalizePersistedComfyUiState,
  type ComfyUiStateCommitResult,
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

function decodeStateRecord(record: unknown): PersistedComfyUiState | undefined {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
  const value = record as Record<string, unknown>;
  if (value.schemaVersion !== STATE_SCHEMA_VERSION || !value.value) return undefined;
  try {
    return snapshot(normalizePersistedComfyUiState(value.value));
  } catch {
    return undefined;
  }
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => structurallyEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && structurallyEqual(leftRecord[key], rightRecord[key]));
}

/** Chrome IndexedDB 中唯一的 ComfyUI durable state adapter。 */
export function createChromeComfyUiStateRepository(options?: {
  readonly backend?: ChromeKeyValueBackend;
}): ComfyUiStateRepository {
  const backend = options?.backend ?? createBrowserIndexedDbBackend();
  let writeLane: Promise<void> = Promise.resolve();

  function runInWriteLane<T>(operation: () => Promise<T>): Promise<T> {
    const result = writeLane.then(operation);
    writeLane = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    async load() {
      await writeLane;
      const record = await backend.get<unknown>('comfyUiState', STATE_KEY);
      return decodeStateRecord(record);
    },
    async save(state) {
      const value = normalizePersistedComfyUiState(state);
      const record: PersistedStateRecord = { schemaVersion: STATE_SCHEMA_VERSION, value };
      await runInWriteLane(() => backend.put('comfyUiState', STATE_KEY, snapshot(record)));
    },
    async clear() {
      await runInWriteLane(() => backend.delete('comfyUiState', STATE_KEY));
    },
    async compareAndSave(
      expected: PersistedComfyUiState | undefined,
      next: PersistedComfyUiState,
      signal?: AbortSignal,
    ): Promise<ComfyUiStateCommitResult> {
      const normalizedExpected = expected === undefined ? undefined : normalizePersistedComfyUiState(expected);
      const value = normalizePersistedComfyUiState(next);
      const record: PersistedStateRecord = { schemaVersion: STATE_SCHEMA_VERSION, value };
      return runInWriteLane(() => backend.atomicCompareAndPut(
        'comfyUiState',
        STATE_KEY,
        snapshot(record),
        (current) => structurallyEqual(decodeStateRecord(current), normalizedExpected),
        signal,
      ));
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

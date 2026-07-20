import { createImmutableSnapshot } from '@imagen-ps/core-engine';
import type {
  ComfyUiStateRepository,
  PersistedComfyUiState,
  ComfyUiWorkflowRuntimeCache,
  ComfyUiWorkflowDraftStore,
  LoadedWorkflowRuntime,
  WorkflowRuntimeDraft,
} from './types.js';

function snapshot<T>(value: T): T {
  return createImmutableSnapshot(value) as T;
}

const MAX_STATE_BYTES = 256_000;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function validRef(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  if (typeof ref.nodeId !== 'string' || ref.nodeId.length === 0 || ref.nodeId.length > 128 || CONTROL_CHARS.test(ref.nodeId)) return false;
  const hasName = ref.inputName !== undefined;
  const hasIndex = ref.widgetIndex !== undefined;
  return hasName !== hasIndex
    && (!hasName || (typeof ref.inputName === 'string' && ref.inputName.length > 0 && ref.inputName.length <= 256 && !CONTROL_CHARS.test(ref.inputName)))
    && (!hasIndex || (Number.isSafeInteger(ref.widgetIndex) && Number(ref.widgetIndex) >= 0 && Number(ref.widgetIndex) <= 256));
}

function validMaskBinding(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return Object.keys(binding).every((key) => ['transport', 'inputRef', 'polarity'].includes(key))
    && binding.transport === 'separate-image-input'
    && validRef(binding.inputRef)
    && (binding.polarity === 'white-edit' || binding.polarity === 'black-edit');
}

/** Validate and freeze strict persisted allowlist. */
export function normalizePersistedComfyUiState(value: unknown): PersistedComfyUiState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-comfyui-state');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['baseUrl', 'selectedWorkflowId', 'ambiguousMappingsByRevision'].includes(key))) throw new Error('invalid-comfyui-state');
  if (typeof input.baseUrl !== 'string' || input.baseUrl.length === 0 || input.baseUrl.length > 2048 || CONTROL_CHARS.test(input.baseUrl)) throw new Error('invalid-comfyui-state');
  if (input.selectedWorkflowId !== null && (typeof input.selectedWorkflowId !== 'string' || input.selectedWorkflowId.length === 0 || input.selectedWorkflowId.length > 256 || CONTROL_CHARS.test(input.selectedWorkflowId))) throw new Error('invalid-comfyui-state');
  const mappings = input.ambiguousMappingsByRevision;
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new Error('invalid-comfyui-state');
  for (const [revision, record] of Object.entries(mappings)) {
    if (!revision || revision.length > 256 || CONTROL_CHARS.test(revision) || !record || typeof record !== 'object' || Array.isArray(record)) throw new Error('invalid-comfyui-state');
    for (const [kind, mapping] of Object.entries(record)) {
      if (kind === 'mask') {
        if (!validMaskBinding(mapping)) throw new Error('invalid-comfyui-state');
      } else if ((kind !== 'text' && kind !== 'image') || !validRef(mapping)) {
        throw new Error('invalid-comfyui-state');
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_STATE_BYTES) throw new Error('invalid-comfyui-state');
  return snapshot({
    baseUrl: input.baseUrl,
    selectedWorkflowId: input.selectedWorkflowId as string | null,
    ambiguousMappingsByRevision: mappings as PersistedComfyUiState['ambiguousMappingsByRevision'],
  });
}

export const createPersistedComfyUiState = normalizePersistedComfyUiState;

/** Deterministic in-memory persistence implementing exact allowlist. */
export function createInMemoryComfyUiStateRepository(initial?: PersistedComfyUiState): ComfyUiStateRepository {
  let current = initial === undefined ? undefined : normalizePersistedComfyUiState(initial);
  return {
    async load() { return current === undefined ? undefined : snapshot(current); },
    async save(value) { current = normalizePersistedComfyUiState(value); },
    async clear() { current = undefined; },
  };
}

/** Harness factory for deterministic Application tests. */
export function createComfyUiTestHarness(initial?: PersistedComfyUiState) {
  return {
    state: createInMemoryComfyUiStateRepository(initial),
    cache: createComfyUiWorkflowRuntimeCache(),
    drafts: createComfyUiWorkflowDraftStore(),
  };
}

/** Runtime-only cache; no persistence side effects. */
export function createComfyUiWorkflowRuntimeCache(): ComfyUiWorkflowRuntimeCache {
  const records = new Map<string, LoadedWorkflowRuntime>();
  return {
    get(workflowId, revision) {
      const value = records.get(workflowId);
      return value === undefined || (revision !== undefined && value.identity.revision !== revision) ? undefined : value;
    },
    set(runtime) { records.set(runtime.identity.workflowId, snapshot(runtime)); },
    invalidate(workflowId) {
      if (workflowId === undefined) records.clear(); else records.delete(workflowId);
    },
    clear() { records.clear(); },
  };
}

/** Session-only workflow parameter draft store. */
export function createComfyUiWorkflowDraftStore(): ComfyUiWorkflowDraftStore {
  const records = new Map<string, WorkflowRuntimeDraft>();
  const key = (workflowId: string, revision: string) => `${workflowId}\u0000${revision}`;
  return {
    get(workflowId, revision) { const value = records.get(key(workflowId, revision)); return value === undefined ? undefined : snapshot(value); },
    set(draft) { records.set(key(draft.workflowId, draft.revision), snapshot(draft)); },
    invalidate(workflowId, revision) {
      if (workflowId === undefined) {
        records.clear();
      } else if (revision === undefined) {
        for (const item of records.keys()) {
          if (item.startsWith(`${workflowId}\u0000`)) records.delete(item);
        }
      } else {
        records.delete(key(workflowId, revision));
      }
    },
    clear() { records.clear(); },
  };
}

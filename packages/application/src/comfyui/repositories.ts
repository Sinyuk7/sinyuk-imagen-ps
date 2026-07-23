import { createImmutableSnapshot } from '@imagen-ps/core-engine';
import type {
  ComfyUiConnectionCoordinatorPorts,
  ComfyUiConnectionTarget,
  ComfyUiFrontendBridgeGeneration,
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

function samePersistedState(left: PersistedComfyUiState | undefined, right: PersistedComfyUiState | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
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

/** 校验并冻结严格 persisted allowlist。 */
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

/** 创建严格 allowlist 的 persisted ComfyUI state。 */
export const createPersistedComfyUiState = normalizePersistedComfyUiState;

/** 创建实现 exact allowlist 与 CAS 的 deterministic in-memory repository。 */
export function createInMemoryComfyUiStateRepository(initial?: PersistedComfyUiState): ComfyUiStateRepository {
  let current = initial === undefined ? undefined : normalizePersistedComfyUiState(initial);
  let writeTail = Promise.resolve();
  const enqueue = <T>(operation: () => T | Promise<T>): Promise<T> => {
    const pending = writeTail.then(operation, operation);
    writeTail = pending.then(() => undefined, () => undefined);
    return pending;
  };
  return {
    async load() { return current === undefined ? undefined : snapshot(current); },
    save(value) {
      return enqueue(() => { current = normalizePersistedComfyUiState(value); });
    },
    clear() {
      return enqueue(() => { current = undefined; });
    },
    compareAndSave(expected, next, signal) {
      return enqueue(() => {
        if (signal?.aborted) return 'aborted' as const;
        if (!samePersistedState(current, expected)) return 'conflict' as const;
        const normalized = normalizePersistedComfyUiState(next);
        if (signal?.aborted) return 'aborted' as const;
        current = normalized;
        return 'committed' as const;
      });
    },
  };
}

/** Deterministic harness deferred gate。 */
export interface ComfyUiDeferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): ComfyUiDeferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

/** 创建包含 deferred validation、CAS 与 lifecycle recorder 的 deterministic harness。 */
export function createComfyUiTestHarness(initial?: PersistedComfyUiState) {
  const backingState = createInMemoryComfyUiStateRepository(initial);
  const apiGates: ComfyUiDeferred<void>[] = [];
  const bridgeGates: ComfyUiDeferred<void>[] = [];
  const commitGates: ComfyUiDeferred<void>[] = [];
  const apiTargets: ComfyUiConnectionTarget[] = [];
  const generations: ComfyUiFrontendBridgeGeneration[] = [];
  const transitions: string[] = [];
  let currentTime = 0;
  const clock = {
    now: () => currentTime,
    advance(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) throw new Error('invalid-harness-time');
      currentTime += ms;
    },
  };
  const state: ComfyUiStateRepository = {
    load: () => backingState.load(),
    save: (value) => backingState.save(value),
    clear: () => backingState.clear(),
    async compareAndSave(expected, next, signal) {
      transitions.push('persistence');
      const gate = commitGates.shift();
      if (gate !== undefined) await gate.promise;
      return backingState.compareAndSave(expected, next, signal);
    },
  };
  const generationFactory = {
    create(target: ComfyUiConnectionTarget): ComfyUiFrontendBridgeGeneration {
      transitions.push('generation');
      let disposed = false;
      let retired = false;
      const generation: ComfyUiFrontendBridgeGeneration = {
        target,
        async resolve() {
          transitions.push('frontend');
          return disposed ? undefined : {
            identity: { origin: target.origin, sourceId: 'harness', loadId: `generation-${generations.length + 1}` },
            async exchange() { return {}; },
          };
        },
        retire() {
          if (retired || disposed) return;
          retired = true;
          transitions.push('retire');
          this.dispose();
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          transitions.push('dispose');
        },
      };
      generations.push(generation);
      return generation;
    },
  };
  const connectionPorts: ComfyUiConnectionCoordinatorPorts = {
    state,
    generationFactory,
    async validateApi(target) {
      transitions.push('api');
      apiTargets.push(target);
      const gate = apiGates.shift();
      if (gate !== undefined) await gate.promise;
    },
    async validateBridge() {
      transitions.push('bridge');
      const gate = bridgeGates.shift();
      if (gate !== undefined) await gate.promise;
    },
    now: clock.now,
  };
  return {
    state,
    cache: createComfyUiWorkflowRuntimeCache(),
    drafts: createComfyUiWorkflowDraftStore(),
    connectionPorts,
    clock,
    records: { apiTargets, generations, transitions },
    deferApi() { const gate = deferred<void>(); apiGates.push(gate); return gate; },
    deferBridge() { const gate = deferred<void>(); bridgeGates.push(gate); return gate; },
    deferCommit() { const gate = deferred<void>(); commitGates.push(gate); return gate; },
  };
}

/** 创建无 persistence side effect 的 runtime-only cache。 */
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

/** 创建 session-only workflow parameter draft store。 */
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

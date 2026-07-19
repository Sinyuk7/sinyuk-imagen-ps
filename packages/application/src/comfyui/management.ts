import { createImmutableSnapshot, createValidationError } from '@imagen-ps/core-engine';
import type {
  ComfyUiRuntimePolicy,
  ComfyUiRuntimePorts,
  ComfyUiStateRepository,
  ComfyUiWorkflowDraftStore,
  ComfyUiWorkflowRuntimeCache,
  LoadedWorkflowRuntime,
  PersistedComfyUiState,
  WorkflowIdentity,
  WorkflowLoadState,
  WorkflowMapping,
} from './types.js';
import { normalizePersistedComfyUiState } from './repositories.js';
import { collectWorkflowInputCandidates, projectWorkflowMapping, resolveWorkflowMapping } from './workflow-policy.js';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_BASE_URL_LENGTH = 2_048;
const MAX_ROUTE_LENGTH = 512;

function boundedText(value: unknown, max: number, path: string): string {
  if (typeof value !== 'string') throw createValidationError(`${path} must be a string.`, { path });
  const result = value.trim();
  if (!result || result.length > max || CONTROL_CHARS.test(result)) throw createValidationError(`${path} is invalid.`, { path });
  return result;
}

function normalizedUrl(raw: string, protocol?: 'http:' | 'https:'): string {
  const text = boundedText(raw, MAX_BASE_URL_LENGTH, 'ComfyUi.baseUrl');
  const candidate = protocol === undefined && /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `${protocol ?? 'https:'}//${text}`;
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw createValidationError('ComfyUI address is invalid.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw createValidationError('ComfyUI address must use HTTP(S).');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw createValidationError('ComfyUI address contains unsupported URL fields.');
  if (CONTROL_CHARS.test(parsed.pathname)) throw createValidationError('ComfyUI address contains control characters.');
  const path = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return `${parsed.protocol}//${parsed.host}${path}`;
}

/** Normalize explicit or bare ComfyUI address; preserve reverse-proxy path. */
export function normalizeComfyUiBaseUrl(value: string): string {
  return normalizedUrl(value);
}

/** Return bounded HTTPS/HTTP candidates for bare address probe. */
export function comfyUiBaseUrlCandidates(value: string): readonly string[] {
  const text = boundedText(value, MAX_BASE_URL_LENGTH, 'ComfyUi.baseUrl');
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) return [normalizeComfyUiBaseUrl(text)];
  return [normalizedUrl(text, 'https:'), normalizedUrl(text, 'http:')];
}

/** Join API route below canonical base path without dropping proxy prefix. */
export function joinComfyUiRoute(baseUrl: string, route: string): string {
  const base = normalizeComfyUiBaseUrl(baseUrl);
  const suffix = boundedText(route, MAX_ROUTE_LENGTH, 'ComfyUi.route');
  if (!suffix.startsWith('/') || suffix.startsWith('//') || CONTROL_CHARS.test(suffix)) throw createValidationError('ComfyUI route is invalid.');
  return `${base}${suffix}`;
}

function identity(value: Omit<WorkflowIdentity, 'groupPath'> & { readonly groupPath?: readonly string[] }): WorkflowIdentity {
  const remotePath = boundedText(value.remotePath, 512, 'Workflow.remotePath');
  if (remotePath.startsWith('/') || remotePath.includes('\\') || remotePath.split('/').some((part) => !part || part === '.' || part === '..')) throw createValidationError('Workflow.remotePath is unsafe.');
  const groupPath = remotePath.split('/').slice(0, -1);
  return createImmutableSnapshot({
    workflowId: boundedText(value.workflowId, 256, 'Workflow.workflowId'),
    displayName: boundedText(value.displayName, 256, 'Workflow.displayName'),
    remotePath,
    groupPath,
    revision: value.revision === null || value.revision === undefined ? null : boundedText(value.revision, 256, 'Workflow.revision'),
  }) as WorkflowIdentity;
}

export interface ComfyUiManagementService {
  loadState(): Promise<PersistedComfyUiState | undefined>;
  saveBaseUrl(value: string, signal?: AbortSignal): Promise<PersistedComfyUiState>;
  discover(signal?: AbortSignal): Promise<readonly WorkflowIdentity[]>;
  selectWorkflow(workflowId: string, signal?: AbortSignal): Promise<LoadedWorkflowRuntime>;
  refresh(signal?: AbortSignal): Promise<LoadedWorkflowRuntime | undefined>;
  openInComfyUi(signal?: AbortSignal): Promise<void>;
  getLoadState(): WorkflowLoadState;
  setMapping(workflowId: string, revision: string, kind: 'text' | 'image', value: WorkflowMapping): Promise<void>;
  getMappingProjection(runtime: LoadedWorkflowRuntime): ReturnType<typeof projectWorkflowMapping>;
  getDraft(workflowId: string, revision: string): ReturnType<ComfyUiWorkflowDraftStore['get']>;
  setDraft(draft: NonNullable<ReturnType<ComfyUiWorkflowDraftStore['get']>>): void;
  clearDrafts(): void;
  setDraftStore(store: ComfyUiWorkflowDraftStore): void;
}

/** Singleton ComfyUI management: deferred open, runtime cache and stale suppression. */
export type ComfyUiManagementServiceOptions = {
  readonly state: ComfyUiStateRepository;
  readonly ports: ComfyUiRuntimePorts;
  readonly cache: ComfyUiWorkflowRuntimeCache;
  readonly drafts?: ComfyUiWorkflowDraftStore;
  readonly policy?: ComfyUiRuntimePolicy;
};

export function createComfyUiManagementService(options: ComfyUiManagementServiceOptions): ComfyUiManagementService {
  const policy = options.policy;
  let durable: PersistedComfyUiState | undefined;
  let catalog: readonly WorkflowIdentity[] = [];
  let current: LoadedWorkflowRuntime | undefined;
  let loadState: WorkflowLoadState = { status: 'idle' };
  let requestSerial = 0;
  let drafts = options.drafts;
  const state = async () => durable ?? (durable = await options.state.load());
  const save = async (value: PersistedComfyUiState) => { durable = normalizePersistedComfyUiState(value); await options.state.save(durable); return durable; };
  const mappingKey = (workflowId: string, revision: string) => `${workflowId}@${revision}`;

  return {
    async loadState() { return state(); },
    async saveBaseUrl(value, signal) {
      const candidates = comfyUiBaseUrlCandidates(value);
      let selected: string | undefined;
      if (options.ports.probe === undefined) selected = candidates[0];
      else for (const candidate of candidates.slice(0, 2)) {
        try { await options.ports.probe(candidate, signal); selected = candidate; break; } catch { /* bounded candidate fallback */ }
      }
      if (selected === undefined) throw createValidationError('ComfyUI server is unavailable.');
      const previous = await state();
      return save({ baseUrl: selected, selectedWorkflowId: previous?.selectedWorkflowId ?? null, ambiguousMappingsByRevision: previous?.ambiguousMappingsByRevision ?? {} });
    },
    async discover(signal) {
      const currentState = await state();
      if (!currentState?.baseUrl) return [];
      const found = await options.ports.discover(currentState.baseUrl, signal);
      if (found.length > (policy?.maxDiscoveryEntries ?? 1_000)) throw createValidationError('ComfyUI workflow discovery exceeded bounds.');
      const nextCatalog = found.map(identity);
      const workflowIds = new Set<string>();
      const remotePaths = new Set<string>();
      for (const item of nextCatalog) {
        if (workflowIds.has(item.workflowId) || remotePaths.has(item.remotePath)) {
          throw createValidationError('ComfyUI workflow discovery contains duplicate identities.');
        }
        workflowIds.add(item.workflowId);
        remotePaths.add(item.remotePath);
      }
      for (const previous of catalog) {
        const next = nextCatalog.find((item) => item.workflowId === previous.workflowId);
        if (next?.revision !== previous.revision) {
          options.cache.invalidate(previous.workflowId);
          drafts?.invalidate(previous.workflowId, previous.revision ?? undefined);
          if (current?.identity.workflowId === previous.workflowId) current = undefined;
        }
      }
      catalog = nextCatalog;
      return createImmutableSnapshot(catalog) as readonly WorkflowIdentity[];
    },
    async selectWorkflow(workflowId, signal) {
      const id = boundedText(workflowId, 256, 'Workflow.workflowId');
      const descriptor = catalog.find((item) => item.workflowId === id);
      if (!descriptor) throw createValidationError('ComfyUI workflow was not found.', { workflowId: id });
      const cached = options.cache.get(id, descriptor.revision ?? undefined);
      if (cached) { current = cached; loadState = { status: 'ready', runtime: cached }; return cached; }
      const serial = ++requestSerial;
      loadState = { status: 'loading', workflowId: id, requestId: String(serial) };
      try {
        const loaded = await options.ports.load((await state())?.baseUrl ?? '', descriptor, signal);
        if (serial !== requestSerial) throw createValidationError('ComfyUI workflow load became stale.');
        const runtime = createImmutableSnapshot(loaded) as LoadedWorkflowRuntime;
        options.cache.set(runtime); current = runtime; loadState = { status: 'ready', runtime };
        const prior = await state();
        if (prior) await save({ ...prior, selectedWorkflowId: id });
        return runtime;
      } catch (error) {
        if (serial === requestSerial) loadState = { status: 'error', workflowId: id, message: 'ComfyUI workflow could not be loaded.' };
        throw error;
      }
    },
    async refresh(signal) {
      if (!current) return undefined;
      options.cache.invalidate(current.identity.workflowId); requestSerial += 1;
      const descriptor = catalog.find((item) => item.workflowId === current?.identity.workflowId);
      if (!descriptor) { current = undefined; loadState = { status: 'idle' }; return undefined; }
      return this.selectWorkflow(descriptor.workflowId, signal);
    },
    async openInComfyUi(signal) {
      if (current && options.ports.open) await options.ports.open((await state())?.baseUrl ?? '', current.identity, signal);
    },
    getLoadState() { return loadState; },
    async setMapping(workflowId, revision, kind, value) {
      const existing = await state(); if (!existing) throw createValidationError('ComfyUI server is not configured.');
      const runtime = current?.identity.workflowId === workflowId && current.identity.revision === revision ? current : undefined;
      const candidates = runtime ? collectWorkflowInputCandidates(runtime.form ?? { nodes: [] }) : undefined;
      const candidateCount = kind === 'text' ? candidates?.textCandidates.length : candidates?.imageCandidates.length;
      if (value !== null && (candidateCount === undefined || candidateCount < 2)) {
        throw createValidationError('ComfyUI mapping is only selectable when inputs are ambiguous.');
      }
      const key = mappingKey(workflowId, revision); const row = { ...(existing.ambiguousMappingsByRevision[key] ?? {}) };
      if (value === null) delete row[kind]; else row[kind] = value;
      const mappings = { ...existing.ambiguousMappingsByRevision };
      if (Object.keys(row).length === 0) delete mappings[key]; else mappings[key] = row;
      await save({ ...existing, ambiguousMappingsByRevision: mappings });
    },
    getMappingProjection(runtime) {
      const candidates = collectWorkflowInputCandidates(runtime.form ?? { nodes: [] });
      const stored = durable?.ambiguousMappingsByRevision[mappingKey(runtime.identity.workflowId, runtime.identity.revision)] ?? {};
      return projectWorkflowMapping(candidates, { text: resolveWorkflowMapping(candidates.textCandidates, stored.text), image: resolveWorkflowMapping(candidates.imageCandidates, stored.image) });
    },
    getDraft(workflowId, revision) { return drafts?.get(workflowId, revision); },
    setDraft(draft) { drafts?.set(draft); },
    clearDrafts() { drafts?.clear(); },
    setDraftStore(store) { drafts = store; },
  };
}

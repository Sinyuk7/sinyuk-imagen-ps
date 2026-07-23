import { createImmutableSnapshot, createValidationError } from '@imagen-ps/core-engine';
import type {
  ComfyUiActiveRoutingResolver,
  ComfyUiConnectionCoordinator,
  ComfyUiConnectionResult,
  ComfyUiConnectionSnapshot,
  ComfyUiConnectionTarget,
  ComfyUiFrontendBridgeGeneration,
  ComfyUiFrontendBridgeGenerationFactory,
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
  ComfyUiMaskBinding,
} from './types.js';
import { normalizePersistedComfyUiState } from './repositories.js';
import { createComfyUiConnectionCoordinator } from './connection.js';
export { deriveComfyUiConnectionTarget, joinComfyUiRoute, normalizeComfyUiBaseUrl } from './connection-target.js';
import { collectWorkflowInputCandidates, projectWorkflowMapping, resolveWorkflowMapping, resolveWorkflowMaskBinding } from './workflow-policy.js';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function boundedText(value: unknown, max: number, path: string): string {
  if (typeof value !== 'string') throw createValidationError(`${path} must be a string.`, { path });
  const result = value.trim();
  if (!result || result.length > max || CONTROL_CHARS.test(result)) throw createValidationError(`${path} is invalid.`, { path });
  return result;
}

function identity(value: Omit<WorkflowIdentity, 'groupPath'> & { readonly groupPath?: readonly string[] }): WorkflowIdentity {
  const remotePath = boundedText(value.remotePath, 512, 'Workflow.remotePath');
  if (remotePath.startsWith('/') || remotePath.includes('\\') || remotePath.split('/').some((part) => !part || part === '.' || part === '..')) throw createValidationError('Workflow.remotePath is unsafe.');
  const groupPath = remotePath.split('/').slice(0, -1);
  return createImmutableSnapshot({
    workflowId: boundedText(value.workflowId, 256, 'Workflow.workflowId'),
    ...(value.nativeWorkflowId === undefined ? {} : { nativeWorkflowId: boundedText(value.nativeWorkflowId, 256, 'Workflow.nativeWorkflowId') }),
    displayName: boundedText(value.displayName, 256, 'Workflow.displayName'),
    remotePath,
    groupPath,
    revision: value.revision === null || value.revision === undefined ? null : boundedText(value.revision, 256, 'Workflow.revision'),
  }) as WorkflowIdentity;
}

/** ComfyUI connection transaction 与 workflow runtime 的 Application service。 */
export interface ComfyUiManagementService {
  loadState(): Promise<PersistedComfyUiState | undefined>;
  connect(value: string, signal?: AbortSignal): Promise<ComfyUiConnectionResult>;
  getConnectionSnapshot(): ComfyUiConnectionSnapshot;
  subscribe(listener: () => void): () => void;
  supersedeCurrentAttempt(nextDraftBaseUrl: string): void;
  dispose(): void;
  discover(signal?: AbortSignal): Promise<readonly WorkflowIdentity[]>;
  selectWorkflow(workflowId: string, signal?: AbortSignal): Promise<LoadedWorkflowRuntime>;
  refresh(signal?: AbortSignal): Promise<LoadedWorkflowRuntime | undefined>;
  openInComfyUi(signal?: AbortSignal): Promise<void>;
  getLoadState(): WorkflowLoadState;
  setMapping(workflowId: string, revision: string, kind: 'text' | 'image', value: WorkflowMapping): Promise<void>;
  setMaskBinding(workflowId: string, revision: string, value: ComfyUiMaskBinding | undefined): Promise<void>;
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
  readonly generationFactory?: ComfyUiFrontendBridgeGenerationFactory;
  readonly validateApi?: (target: ComfyUiConnectionTarget, signal: AbortSignal) => Promise<void>;
  readonly validateBridge?: (generation: ComfyUiFrontendBridgeGeneration, signal: AbortSignal) => Promise<void>;
  readonly activeResolver?: ComfyUiActiveRoutingResolver;
  readonly now?: () => number;
};

/** 创建 singleton ComfyUI management service。 */
export function createComfyUiManagementService(options: ComfyUiManagementServiceOptions): ComfyUiManagementService {
  const policy = options.policy;
  let durable: PersistedComfyUiState | undefined;
  let catalog: readonly WorkflowIdentity[] = [];
  let current: LoadedWorkflowRuntime | undefined;
  let loadState: WorkflowLoadState = { status: 'idle' };
  let requestSerial = 0;
  let discoverySerial = 0;
  let selectionWriteTail = Promise.resolve();
  let durableWriteTail = Promise.resolve();
  let drafts = options.drafts;
  const state = async () => durable ?? (durable = await options.state.load());
  const enqueueDurableWrite = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = durableWriteTail.then(operation, operation);
    durableWriteTail = pending.then(() => undefined, () => undefined);
    return pending;
  };
  const connectionState: ComfyUiStateRepository = {
    load: () => options.state.load(),
    save: (value) => enqueueDurableWrite(() => options.state.save(value)),
    clear: () => enqueueDurableWrite(() => options.state.clear()),
    compareAndSave: (expected, next, signal) => enqueueDurableWrite(
      () => options.state.compareAndSave(expected, next, signal),
    ),
  };
  const mutateState = (
    transform: (currentState: PersistedComfyUiState) => PersistedComfyUiState,
  ): Promise<PersistedComfyUiState> => {
    return enqueueDurableWrite(async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const expected = await options.state.load();
        if (expected === undefined) throw createValidationError('ComfyUI server is not configured.');
        const next = normalizePersistedComfyUiState(transform(expected));
        const result = await options.state.compareAndSave(expected, next);
        if (result === 'committed') {
          durable = next;
          return next;
        }
        if (result === 'aborted') throw createValidationError('ComfyUI state update was aborted.');
      }
      throw createValidationError('ComfyUI state changed concurrently.');
    });
  };
  const saveSelectedWorkflow = (workflowId: string, serial: number): Promise<boolean> => {
    let currentRequestWon = false;
    const write = selectionWriteTail.then(async () => {
      if (serial !== requestSerial) return;
      const prior = await state();
      if (serial !== requestSerial) return;
      if (prior && prior.selectedWorkflowId !== workflowId) {
        await mutateState((latest) => ({ ...latest, selectedWorkflowId: workflowId }));
      }
      currentRequestWon = serial === requestSerial;
    });
    selectionWriteTail = write.then(() => undefined, () => undefined);
    return write.then(() => currentRequestWon);
  };
  const mappingKey = (workflowId: string, revision: string) => `${workflowId}@${revision}`;
  const withoutMaskBinding = async (workflowId: string, revision: string) => {
    const existing = await state();
    if (!existing) return;
    const key = mappingKey(workflowId, revision);
    const row = existing.ambiguousMappingsByRevision[key];
    if (!row?.mask) return;
    await mutateState((latest) => {
      const latestRow = latest.ambiguousMappingsByRevision[key] ?? {};
      const { mask: _latestMask, ...latestNextRow } = latestRow;
      const mappings = { ...latest.ambiguousMappingsByRevision };
      if (Object.keys(latestNextRow).length === 0) delete mappings[key]; else mappings[key] = latestNextRow;
      return { ...latest, ambiguousMappingsByRevision: mappings };
    });
  };

  const unavailableGenerationFactory: ComfyUiFrontendBridgeGenerationFactory = {
    create(target) {
      let disposed = false;
      return {
        target,
        async resolve() { return undefined; },
        retire() { if (!disposed) this.dispose(); },
        dispose() { disposed = true; },
      };
    },
  };
  let refreshPromotedTarget: (target: ComfyUiConnectionTarget) => void = () => undefined;
  const coordinator: ComfyUiConnectionCoordinator = createComfyUiConnectionCoordinator({
    state: connectionState,
    generationFactory: options.generationFactory ?? unavailableGenerationFactory,
    validateApi: options.validateApi ?? (async (target, signal) => {
      if (options.ports.probe === undefined) {
        throw { code: 'API_UNREACHABLE', reason: 'validation-unavailable' };
      }
      const capabilities = await options.ports.probe(target.baseUrl, signal);
      if (capabilities.api !== 'ready') throw { code: 'API_UNREACHABLE', reason: 'api-unreachable' };
    }),
    validateBridge: options.validateBridge ?? (async () => undefined),
    ...(options.activeResolver === undefined ? {} : { activeResolver: options.activeResolver }),
    invalidateRuntime() {
      requestSerial += 1;
      catalog = [];
      current = undefined;
      loadState = { status: 'idle' };
      options.cache.clear();
      drafts?.clear();
    },
    refreshActive(target) { refreshPromotedTarget(target); },
    ...(options.now === undefined ? {} : { now: options.now }),
  }, policy);

  const runtimeBaseUrl = async (): Promise<string> => {
    const activeBaseUrl = coordinator.getSnapshot().activeConnection?.target.baseUrl;
    if (activeBaseUrl !== undefined) return activeBaseUrl;
    if (options.generationFactory !== undefined) return '';
    return (await state())?.baseUrl ?? '';
  };
  let startupRecovery: Promise<ComfyUiConnectionResult | undefined> | undefined;

  const service: ComfyUiManagementService = {
    async loadState() {
      await coordinator.initialize();
      if (options.generationFactory !== undefined) {
        startupRecovery ??= coordinator.recoverCommitted();
        await startupRecovery;
      }
      return state();
    },
    async connect(value, signal) {
      const result = await coordinator.connect(value, signal);
      if (result.ok) durable = await options.state.load();
      return result;
    },
    getConnectionSnapshot() { return coordinator.getSnapshot(); },
    subscribe(listener) { return coordinator.subscribe(listener); },
    supersedeCurrentAttempt(nextDraftBaseUrl) { coordinator.supersedeCurrentAttempt(nextDraftBaseUrl); },
    dispose() { coordinator.dispose(); },
    async discover(signal) {
      await coordinator.initialize();
      const serial = ++discoverySerial;
      const ownerAttemptId = coordinator.getSnapshot().activeConnection?.attemptId;
      const baseUrl = await runtimeBaseUrl();
      if (!baseUrl) return [];
      const isCurrentDiscovery = () => serial === discoverySerial
        && coordinator.getSnapshot().activeConnection?.attemptId === ownerAttemptId;
      const found = await options.ports.discover(baseUrl, signal);
      if (!isCurrentDiscovery()) return [];
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
      if (!isCurrentDiscovery()) return [];
      for (const previous of catalog) {
        if (!isCurrentDiscovery()) return [];
        const next = nextCatalog.find((item) => item.workflowId === previous.workflowId);
        if (next?.revision !== previous.revision) {
          options.cache.invalidate(previous.workflowId);
          drafts?.invalidate(previous.workflowId, previous.revision ?? undefined);
          if (previous.revision !== null) {
            await withoutMaskBinding(previous.workflowId, previous.revision);
            if (!isCurrentDiscovery()) return [];
          }
          if (current?.identity.workflowId === previous.workflowId) current = undefined;
        }
      }
      if (!isCurrentDiscovery()) return [];
      catalog = nextCatalog;
      return createImmutableSnapshot(catalog) as readonly WorkflowIdentity[];
    },
    async selectWorkflow(workflowId, signal) {
      const id = boundedText(workflowId, 256, 'Workflow.workflowId');
      const descriptor = catalog.find((item) => item.workflowId === id);
      if (!descriptor) throw createValidationError('ComfyUI workflow was not found.', { workflowId: id });
      const cached = options.cache.get(id, descriptor.revision ?? undefined);
      if (cached) {
        const serial = ++requestSerial;
        if (!await saveSelectedWorkflow(id, serial) || serial !== requestSerial) throw createValidationError('ComfyUI workflow load became stale.');
        current = cached;
        loadState = { status: 'ready', runtime: cached };
        return cached;
      }
      const serial = ++requestSerial;
      loadState = { status: 'loading', workflowId: id, requestId: String(serial) };
      try {
        const loaded = await options.ports.load(await runtimeBaseUrl(), descriptor, signal);
        if (serial !== requestSerial) throw createValidationError('ComfyUI workflow load became stale.');
        const runtime = createImmutableSnapshot(loaded) as LoadedWorkflowRuntime;
        if (!await saveSelectedWorkflow(id, serial) || serial !== requestSerial) throw createValidationError('ComfyUI workflow load became stale.');
        options.cache.set(runtime); current = runtime; loadState = { status: 'ready', runtime };
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
      if (current && options.ports.open) await options.ports.open(await runtimeBaseUrl(), current.identity, signal);
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
      await mutateState((latest) => {
        const key = mappingKey(workflowId, revision);
        const row = { ...(latest.ambiguousMappingsByRevision[key] ?? {}) };
        if (value === null) delete row[kind]; else row[kind] = value;
        const mappings = { ...latest.ambiguousMappingsByRevision };
        if (Object.keys(row).length === 0) delete mappings[key]; else mappings[key] = row;
        return { ...latest, ambiguousMappingsByRevision: mappings };
      });
    },
    async setMaskBinding(workflowId, revision, value) {
      const existing = await state(); if (!existing) throw createValidationError('ComfyUI server is not configured.');
      const runtime = current?.identity.workflowId === workflowId && current.identity.revision === revision ? current : undefined;
      if (!runtime) throw createValidationError('ComfyUI Mask binding requires the current Workflow revision.');
      const candidates = collectWorkflowInputCandidates(runtime.form ?? { nodes: [] });
      if (value !== undefined) {
        if (value.transport !== 'separate-image-input' || !candidates.maskCandidates.some((item) => item.ref.nodeId === value.inputRef.nodeId && item.ref.inputName === value.inputRef.inputName && item.ref.widgetIndex === value.inputRef.widgetIndex)) throw createValidationError('ComfyUI Mask binding must select an explicit upload-image input.');
        const stored = existing.ambiguousMappingsByRevision[mappingKey(workflowId, revision)];
        const primary = resolveWorkflowMapping(candidates.imageCandidates, stored?.image);
        if (primary?.nodeId === value.inputRef.nodeId && primary.inputName === value.inputRef.inputName && primary.widgetIndex === value.inputRef.widgetIndex) throw createValidationError('ComfyUI Mask binding must not replace the Primary image input.');
      }
      await mutateState((latest) => {
        const key = mappingKey(workflowId, revision);
        const row = { ...(latest.ambiguousMappingsByRevision[key] ?? {}) };
        if (value === undefined) delete row.mask; else row.mask = value;
        const latestMappings = { ...latest.ambiguousMappingsByRevision };
        if (Object.keys(row).length === 0) delete latestMappings[key]; else latestMappings[key] = row;
        return { ...latest, ambiguousMappingsByRevision: latestMappings };
      });
    },
    getMappingProjection(runtime) {
      const candidates = collectWorkflowInputCandidates(runtime.form ?? { nodes: [] });
      const stored = durable?.ambiguousMappingsByRevision[mappingKey(runtime.identity.workflowId, runtime.identity.revision)] ?? {};
      return projectWorkflowMapping(candidates, { text: resolveWorkflowMapping(candidates.textCandidates, stored.text), image: resolveWorkflowMapping(candidates.imageCandidates, stored.image), mask: resolveWorkflowMaskBinding(candidates.maskCandidates, stored.mask) });
    },
    getDraft(workflowId, revision) { return drafts?.get(workflowId, revision); },
    setDraft(draft) { drafts?.set(draft); },
    clearDrafts() { drafts?.clear(); },
    setDraftStore(store) { drafts = store; },
  };
  refreshPromotedTarget = () => { void service.discover().catch(() => undefined); };
  return service;
}

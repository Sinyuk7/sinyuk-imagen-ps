import { describe, expect, it } from 'vitest';
import {
  deriveComfyUiConnectionTarget,
  joinComfyUiRoute,
  normalizeComfyUiBaseUrl,
  createComfyUiManagementService,
} from './management.js';
import {
  createComfyUiWorkflowDraftStore,
  createComfyUiWorkflowRuntimeCache,
  createComfyUiTestHarness,
  createInMemoryComfyUiStateRepository,
} from './repositories.js';
import { collectWorkflowInputCandidates, composeWorkflowMutations, projectWorkflowMapping, resolveWorkflowMapping } from './workflow-policy.js';
import { createComfyUiGenerationBackend, comfyUiExecutionInput } from './backend.js';
import type { ComfyUiExecutionIntent, PersistedComfyUiState } from './types.js';
import type { TaskRecord } from '../task.js';
import type { LoadedWorkflowRuntime, WorkflowForm } from './types.js';

const form: WorkflowForm = {
  nodes: [{
    nodeId: '1', title: '# Prompt', label: 'Prompt', order: 0, active: true, visible: true,
    widgets: [{ ref: { nodeId: '1', inputName: 'text' }, kind: 'string', label: 'Text', workflowValue: 'saved', writable: true, visible: true, order: 0 }],
  }],
};

const raceForm: WorkflowForm = {
  nodes: [
    {
      nodeId: 'prompt',
      title: '# Prompt',
      label: 'Prompt',
      order: 0,
      active: true,
      visible: true,
      widgets: [
        { ref: { nodeId: 'prompt', inputName: 'text' }, kind: 'string', label: 'Text', writable: true, visible: true, order: 0 },
        { ref: { nodeId: 'prompt', inputName: 'text2' }, kind: 'string', label: 'Text 2', writable: true, visible: true, order: 1 },
      ],
    },
    {
      nodeId: 'images',
      title: '# Images',
      label: 'Images',
      order: 1,
      active: true,
      visible: true,
      widgets: [
        { ref: { nodeId: 'images', inputName: 'primary' }, kind: 'upload-image', label: 'Primary', writable: true, visible: false, order: 0 },
        { ref: { nodeId: 'images', inputName: 'edit_region' }, kind: 'upload-image', label: 'Edit Region', writable: true, visible: false, order: 1 },
      ],
    },
  ],
};

describe('ComfyUI runtime core', () => {
  it('normalizes singleton URL and preserves reverse-proxy path', () => {
    expect(normalizeComfyUiBaseUrl('https://example.test/comfyui/')).toBe('https://example.test/comfyui');
    expect(joinComfyUiRoute('https://example.test/comfyui', ['', 'prompt'].join('/'))).toBe('https://example.test/comfyui/prompt');
    expect(() => normalizeComfyUiBaseUrl('example.test/comfyui')).toThrow('must include http:// or https://');
    expect(deriveComfyUiConnectionTarget('http://127.0.0.1:8188/proxy/', {
      requestTimeoutMs: 30_000,
      observationTimeoutMs: 300_000,
    })).toMatchObject({
      baseUrl: 'http://127.0.0.1:8188/proxy',
      origin: 'http://127.0.0.1:8188',
      probeUrl: 'http://127.0.0.1:8188/proxy/system_stats',
      frontendBaseUrl: 'http://127.0.0.1:8188/proxy',
      websocketUrl: 'ws://127.0.0.1:8188/proxy/ws',
    });
    expect(() => normalizeComfyUiBaseUrl('https://u:p@example.test')).toThrow();
    expect(() => normalizeComfyUiBaseUrl('https://example.test?q=secret')).toThrow();
  });

  it('enforces exact persistence allowlist and keeps cache/draft runtime-only', async () => {
    const repo = createInMemoryComfyUiStateRepository({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
    await expect(repo.save({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {}, extra: true } as never)).rejects.toThrow();
    const cache = createComfyUiWorkflowRuntimeCache();
    const drafts = createComfyUiWorkflowDraftStore();
    const runtime = { identity: { workflowId: 'wf', displayName: 'WF', remotePath: 'wf.json', groupPath: [], revision: 'r1' }, document: { kind: 'api', graph: {} } } as unknown as LoadedWorkflowRuntime;
    cache.set(runtime); drafts.set({ workflowId: 'wf', revision: 'r1', values: {} });
    expect(cache.get('wf', 'r1')).toBeDefined();
    drafts.invalidate('wf', 'r2');
    expect(drafts.get('wf', 'r1')).toBeDefined();
    await repo.clear();
    expect(await repo.load()).toBeUndefined();
  });

  it('recovers committed target and suppresses old-target discovery after promotion', async () => {
    const harness = createComfyUiTestHarness({
      baseUrl: 'https://c.example', selectedWorkflowId: null, ambiguousMappingsByRevision: {},
    });
    let releaseOldDiscovery!: () => void;
    let markOldDiscoveryStarted!: () => void;
    const oldDiscoveryStarted = new Promise<void>((resolve) => { markOldDiscoveryStarted = resolve; });
    const oldDiscovery = new Promise<void>((resolve) => { releaseOldDiscovery = resolve; });
    const discoveryTargets: string[] = [];
    const service = createComfyUiManagementService({
      state: harness.state,
      cache: harness.cache,
      drafts: harness.drafts,
      generationFactory: harness.connectionPorts.generationFactory,
      validateApi: harness.connectionPorts.validateApi,
      validateBridge: harness.connectionPorts.validateBridge,
      ports: {
        async discover(baseUrl) {
          discoveryTargets.push(baseUrl);
          if (baseUrl === 'https://c.example') {
            markOldDiscoveryStarted();
            await oldDiscovery;
            return [{ workflowId: 'old', displayName: 'Old', remotePath: 'old.json', revision: 'r1' }];
          }
          return [{ workflowId: 'new', displayName: 'New', remotePath: 'new.json', revision: 'r1' }];
        },
        async load(_baseUrl, descriptor) {
          return {
            identity: { ...descriptor, groupPath: [], revision: descriptor.revision ?? 'r1' },
            document: { kind: 'api' as const, graph: {} },
            form,
          };
        },
      },
    });

    await service.loadState();
    await oldDiscoveryStarted;
    harness.cache.set({
      identity: { workflowId: 'old', displayName: 'Old', remotePath: 'old.json', groupPath: [], revision: 'r1' },
      document: { kind: 'api', graph: {} },
    });
    await expect(service.connect('https://b.example')).resolves.toMatchObject({ ok: true });
    expect(harness.cache.get('old')).toBeUndefined();
    releaseOldDiscovery();
    await Promise.resolve();
    await Promise.resolve();
    await service.discover();
    await expect(service.selectWorkflow('new')).resolves.toMatchObject({ identity: { workflowId: 'new' } });
    await expect(service.selectWorkflow('old')).rejects.toThrow('workflow was not found');
    expect(discoveryTargets).toContain('https://b.example');
    service.dispose();
  });

  it('projects 0/1/many mapping and stale explicit selection', () => {
    const candidates = collectWorkflowInputCandidates(form);
    expect(candidates.textCandidates).toHaveLength(1);
    expect(resolveWorkflowMapping(candidates.textCandidates, null)).toEqual(candidates.textCandidates[0].ref);
    const zeroImage = projectWorkflowMapping(candidates, { text: candidates.textCandidates[0].ref, image: null });
    expect(zeroImage.showSection).toBe(true);
    expect(zeroImage.image.notice).toBe('此 Workflow 不接收图片附件');
    const many = { ...candidates, textCandidates: [...candidates.textCandidates, { ...candidates.textCandidates[0], ref: { nodeId: '2', inputName: 'text' } }] };
    expect(resolveWorkflowMapping(many.textCandidates, { nodeId: 'missing', inputName: 'x' })).toBeNull();
    expect(projectWorkflowMapping(many, { text: null, image: null }, { prompt: 'hello' }).text.ambiguous).toBe(true);
    expect(projectWorkflowMapping(many, { text: many.textCandidates[0]!.ref, image: null }).showSection).toBe(true);
    const empty = collectWorkflowInputCandidates({ nodes: [] });
    const unused = projectWorkflowMapping(empty, { text: null, image: null }, { prompt: 'hello', attachments: [{} as never] });
    expect(unused.text.notice).toBe('此 Workflow 不使用当前提示词');
    expect(unused.image.notice).toBe('此 Workflow 未识别到图片输入，附件不会发送');
  });

  it('does not offer the Primary image input as its own Mask input', () => {
    const imageForm: WorkflowForm = {
      nodes: [{
        nodeId: 'image', title: 'Load Image', label: 'Load Image', order: 0, active: true, visible: false,
        widgets: [{ ref: { nodeId: 'image', widgetIndex: 0 }, kind: 'upload-image', label: 'image', writable: true, visible: false, order: 0 }],
      }],
    };
    const candidates = collectWorkflowInputCandidates(imageForm);
    const primary = resolveWorkflowMapping(candidates.imageCandidates, undefined);
    const projection = projectWorkflowMapping(candidates, { text: null, image: primary });

    expect(projection.image.resolved).toEqual(primary);
    expect(projection.maskCandidates).toEqual([]);
    expect(projection.mask).toEqual({ requiresExplicitSelection: false });
  });

  it('rejects missing workflow without changing selected state', async () => {
    const service = createComfyUiManagementService({
      state: createInMemoryComfyUiStateRepository({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} }),
      cache: createComfyUiWorkflowRuntimeCache(),
      ports: { discover: async () => [{ workflowId: 'known', displayName: 'Known', remotePath: 'known.json', revision: 'r1' }], load: async () => ({ identity: { workflowId: 'known', displayName: 'Known', remotePath: 'known.json', groupPath: [], revision: 'r1' }, document: { kind: 'api', graph: {} }, form }) },
    });
    await service.discover();
    await expect(service.selectWorkflow('missing')).rejects.toThrow('workflow was not found');
    expect((await service.loadState())?.selectedWorkflowId).toBeNull();
  });

  it('persists cached Workflow selection when switching A to B to A', async () => {
    const repo = createInMemoryComfyUiStateRepository({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
    let loads = 0;
    const identities = [
      { workflowId: 'a', displayName: 'A', remotePath: 'a.json', revision: 'r1' },
      { workflowId: 'b', displayName: 'B', remotePath: 'b.json', revision: 'r1' },
    ];
    const service = createComfyUiManagementService({
      state: repo,
      cache: createComfyUiWorkflowRuntimeCache(),
      ports: {
        discover: async () => identities,
        load: async (_baseUrl, descriptor) => {
          loads += 1;
          return { identity: { ...descriptor, groupPath: [], revision: descriptor.revision ?? 'r1' }, document: { kind: 'api', graph: {} }, form };
        },
      },
    });

    await service.discover();
    await service.selectWorkflow('a');
    await service.selectWorkflow('b');
    await service.selectWorkflow('a');

    expect(loads).toBe(2);
    expect((await repo.load())?.selectedWorkflowId).toBe('a');
  });

  it('keeps the latest cached Workflow selection across delayed persistence', async () => {
    const identities = [
      { workflowId: 'a', displayName: 'A', remotePath: 'a.json', groupPath: [], revision: 'r1' },
      { workflowId: 'b', displayName: 'B', remotePath: 'b.json', groupPath: [], revision: 'r1' },
    ];
    const runtime = (workflowId: string): LoadedWorkflowRuntime => ({
      identity: identities.find((item) => item.workflowId === workflowId)!,
      document: { kind: 'api', graph: {} },
      form,
    });
    const cache = createComfyUiWorkflowRuntimeCache();
    cache.set(runtime('a'));
    cache.set(runtime('b'));
    let persisted = { baseUrl: 'https://example.test', selectedWorkflowId: null as string | null, ambiguousMappingsByRevision: {} };
    let releaseFirstSave!: () => void;
    let markFirstSaveStarted!: () => void;
    const firstSaveStarted = new Promise<void>((resolve) => { markFirstSaveStarted = resolve; });
    const firstSaveBarrier = new Promise<void>((resolve) => { releaseFirstSave = resolve; });
    const service = createComfyUiManagementService({
      state: {
        load: async () => persisted,
        save: async (value) => {
          if (value.selectedWorkflowId === 'a') {
            markFirstSaveStarted();
            await firstSaveBarrier;
          }
          persisted = value;
        },
        compareAndSave: async (expected, value, signal) => {
          if (value.selectedWorkflowId === 'a') {
            markFirstSaveStarted();
            await firstSaveBarrier;
          }
          if (signal?.aborted) return 'aborted';
          if (JSON.stringify(expected) !== JSON.stringify(persisted)) return 'conflict';
          persisted = value;
          return 'committed';
        },
        clear: async () => { persisted = { baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} }; },
      },
      cache,
      ports: { discover: async () => identities, load: async (_baseUrl, identity) => runtime(identity.workflowId) },
    });

    await service.discover();
    const first = service.selectWorkflow('a');
    await firstSaveStarted;
    const second = service.selectWorkflow('b');
    releaseFirstSave();

    await expect(first).rejects.toThrow('became stale');
    await expect(second).resolves.toMatchObject({ identity: { workflowId: 'b' } });
    expect(persisted.selectedWorkflowId).toBe('b');
    expect(service.getLoadState()).toMatchObject({ status: 'ready', runtime: { identity: { workflowId: 'b' } } });
  });

  it('suppresses stale deferred load result', async () => {
    let releaseFirst!: (value: LoadedWorkflowRuntime) => void;
    const first = new Promise<LoadedWorkflowRuntime>((resolve) => { releaseFirst = resolve; });
    const identities = [{ workflowId: 'a', displayName: 'A', remotePath: 'a.json', groupPath: [], revision: null }, { workflowId: 'b', displayName: 'B', remotePath: 'b.json', groupPath: [], revision: null }];
    const makeRuntime = (id: string): LoadedWorkflowRuntime => ({ identity: { ...identities.find((item) => item.workflowId === id)!, revision: 'r1' }, document: { kind: 'api', graph: {} } });
    const service = createComfyUiManagementService({
      state: createInMemoryComfyUiStateRepository({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} }),
      cache: createComfyUiWorkflowRuntimeCache(),
      ports: { discover: async () => identities, load: async (_base, identity) => identity.workflowId === 'a' ? first : makeRuntime(identity.workflowId) },
    });
    await service.discover();
    const pending = service.selectWorkflow('a');
    const current = await service.selectWorkflow('b');
    expect(current.identity.workflowId).toBe('b');
    releaseFirst(makeRuntime('a'));
    await expect(pending).rejects.toThrow();
    expect(service.getLoadState()).toMatchObject({ status: 'ready', runtime: { identity: { workflowId: 'b' } } });
  });

  it('retries mapping and mask writes from latest row after CAS conflict', async () => {
    const workflowId = 'wf';
    const revision = 'r1';
    const key = `${workflowId}@${revision}`;
    let current: PersistedComfyUiState = {
      baseUrl: 'https://example.test',
      selectedWorkflowId: workflowId,
      ambiguousMappingsByRevision: {
        [key]: { image: { nodeId: 'images', inputName: 'primary' } },
      },
    };
    let releaseFirstCompare!: () => void;
    const firstCompare = new Promise<void>((resolve) => { releaseFirstCompare = resolve; });
    let compareCalls = 0;
    const repo = {
      load: async () => JSON.parse(JSON.stringify(current)),
      save: async (value: typeof current) => { current = JSON.parse(JSON.stringify(value)); },
      clear: async () => { current = { baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} }; },
      compareAndSave: async (expected: typeof current | undefined, next: typeof current, signal?: AbortSignal) => {
        compareCalls += 1;
        if (compareCalls === 1) {
          await firstCompare;
        }
        if (signal?.aborted) return 'aborted' as const;
        if (JSON.stringify(current) !== JSON.stringify(expected)) return 'conflict' as const;
        current = JSON.parse(JSON.stringify(next));
        return 'committed' as const;
      },
    };
    const runtime: LoadedWorkflowRuntime = {
      identity: { workflowId, displayName: 'WF', remotePath: 'wf.json', groupPath: [], revision },
      document: { kind: 'api', graph: {} },
      form: raceForm,
    };
    const ports = {
      discover: async () => [{ workflowId, displayName: 'WF', remotePath: 'wf.json', revision }],
      load: async () => runtime,
    };
    const serviceA = createComfyUiManagementService({
      state: repo,
      cache: createComfyUiWorkflowRuntimeCache(),
      ports,
    });
    const serviceB = createComfyUiManagementService({
      state: repo,
      cache: createComfyUiWorkflowRuntimeCache(),
      ports,
    });

    await serviceA.discover();
    await serviceA.selectWorkflow(workflowId);
    await serviceB.discover();
    await serviceB.selectWorkflow(workflowId);

    const textRef = raceForm.nodes[0]!.widgets[1]!.ref;
    const maskRef = raceForm.nodes[1]!.widgets[1]!.ref;
    const writeText = serviceA.setMapping(workflowId, revision, 'text', textRef);
    const writeMask = serviceB.setMaskBinding(workflowId, revision, {
      transport: 'separate-image-input',
      inputRef: maskRef,
      polarity: 'black-edit',
    });

    await Promise.resolve();
    await Promise.resolve();
    releaseFirstCompare();
    await Promise.all([writeText, writeMask]);

    expect(current.ambiguousMappingsByRevision[key]).toEqual({
      image: { nodeId: 'images', inputName: 'primary' },
      text: textRef,
      mask: {
        transport: 'separate-image-input',
        inputRef: maskRef,
        polarity: 'black-edit',
      },
    });
  });

  it('keeps newer discovery catalog when older discover returns late', async () => {
    const workflowId = 'wf';
    const baseState = { baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} };
    let callCount = 0;
    let releaseFirstDiscover!: () => void;
    const firstDiscover = new Promise<void>((resolve) => { releaseFirstDiscover = resolve; });
    const service = createComfyUiManagementService({
      state: createInMemoryComfyUiStateRepository(baseState),
      cache: createComfyUiWorkflowRuntimeCache(),
      ports: {
        discover: async () => {
          callCount += 1;
          if (callCount === 1) {
            await firstDiscover;
            return [{ workflowId, displayName: 'Old', remotePath: 'old.json', revision: 'r1' }];
          }
          return [{ workflowId, displayName: 'New', remotePath: 'new.json', revision: 'r1' }];
        },
        load: async (_baseUrl, descriptor) => ({
          identity: { ...descriptor, groupPath: [], revision: descriptor.revision ?? 'r1' },
          document: { kind: 'api', graph: {} },
          form,
        }),
      },
    });

    const first = service.discover();
    await Promise.resolve();
    await Promise.resolve();
    const second = service.discover();
    await expect(second).resolves.toMatchObject([{ workflowId, displayName: 'New', remotePath: 'new.json', revision: 'r1' }]);
    releaseFirstDiscover();
    await expect(first).resolves.toEqual([]);
    await expect(service.selectWorkflow(workflowId)).resolves.toMatchObject({ identity: { workflowId } });
    await expect(service.selectWorkflow('missing')).rejects.toThrow('workflow was not found');
  });

  it('rejects duplicate discovery identities and invalidates revision-scoped runtime state', async () => {
    let revision = 'r1';
    let loads = 0;
    const cache = createComfyUiWorkflowRuntimeCache();
    const drafts = createComfyUiWorkflowDraftStore();
    const service = createComfyUiManagementService({
      state: createInMemoryComfyUiStateRepository({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} }),
      cache,
      drafts,
      ports: {
        discover: async () => [{ workflowId: 'wf', displayName: 'WF', remotePath: 'folder/wf.json', groupPath: ['folder'], revision }],
        load: async (_base, descriptor) => {
          loads += 1;
          return { identity: { ...descriptor, revision: descriptor.revision ?? revision }, document: { kind: 'api', graph: {} }, form };
        },
      },
    });
    await service.discover();
    await service.selectWorkflow('wf');
    drafts.set({ workflowId: 'wf', revision: 'r1', values: { '1\0text\0': 'draft' } });
    expect(service.getDraft('wf', 'r1')).toBeDefined();
    revision = 'r2';
    await service.discover();
    expect(cache.get('wf', 'r1')).toBeUndefined();
    expect(drafts.get('wf', 'r1')).toBeUndefined();
    expect((await service.selectWorkflow('wf')).identity.revision).toBe('r2');
    expect(loads).toBe(2);

    const duplicateService = createComfyUiManagementService({
      state: createInMemoryComfyUiStateRepository({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} }),
      cache: createComfyUiWorkflowRuntimeCache(),
      ports: { discover: async () => [
        { workflowId: 'duplicate', displayName: 'A', remotePath: 'a.json', revision: 'r1' },
        { workflowId: 'duplicate', displayName: 'B', remotePath: 'b.json', revision: 'r1' },
      ], load: async () => { throw new Error('unused'); } },
    });
    await expect(duplicateService.discover()).rejects.toThrow('duplicate identities');
  });

  it('applies saved, draft and prompt precedence without broadcasting overrides', () => {
    const promptRef = form.nodes[0]!.widgets[0]!.ref;
    const mutations = composeWorkflowMutations({
      form,
      draft: { '1\0text\0': 'draft' },
      mapping: { text: promptRef, image: null },
      composer: { prompt: 'composer' },
    });
    expect(mutations).toEqual([{ ref: promptRef, value: 'composer' }]);
    expect(composeWorkflowMutations({ form, draft: { '1\0text\0': 'draft' }, mapping: { text: promptRef, image: null }, composer: { prompt: '   ' } })).toEqual([{ ref: promptRef, value: 'draft' }]);
  });

  it('does not send unchanged saved widgets as Bridge mutations', () => {
    const manySavedWidgets: WorkflowForm = {
      nodes: [{
        ...form.nodes[0]!,
        widgets: Array.from({ length: 32 }, (_, index) => ({
          ...form.nodes[0]!.widgets[0]!,
          ref: { nodeId: String(index + 1), inputName: 'text' },
          workflowValue: `saved-${index}`,
        })),
      }],
    };
    const selectedPromptRef = manySavedWidgets.nodes[0]!.widgets[0]!.ref;
    expect(composeWorkflowMutations({
      form: manySavedWidgets,
      mapping: { text: selectedPromptRef, image: null },
      composer: { prompt: 'override' },
    })).toEqual([{ ref: selectedPromptRef, value: 'override' }]);
  });

  it('persists explicit ambiguous mappings by revision and invalidates stale targets', async () => {
    const ambiguousForm: WorkflowForm = {
      nodes: [{ ...form.nodes[0]!, widgets: [
        form.nodes[0]!.widgets[0]!,
        { ...form.nodes[0]!.widgets[0]!, ref: { nodeId: '1', inputName: 'text2' }, label: 'Text 2' },
      ] }],
    };
    let revision = 'r1';
    const repo = createInMemoryComfyUiStateRepository({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
    const service = createComfyUiManagementService({
      state: repo,
      cache: createComfyUiWorkflowRuntimeCache(),
      ports: {
        discover: async () => [{ workflowId: 'wf', displayName: 'WF', remotePath: 'wf.json', revision }],
        load: async () => ({ identity: { workflowId: 'wf', displayName: 'WF', remotePath: 'wf.json', groupPath: [], revision }, document: { kind: 'api', graph: {} }, form: ambiguousForm }),
      },
    });
    await service.discover();
    const runtime = await service.selectWorkflow('wf');
    const target = ambiguousForm.nodes[0]!.widgets[1]!.ref;
    await service.setMapping('wf', 'r1', 'text', target);
    expect((await repo.load())?.ambiguousMappingsByRevision['wf@r1']?.text).toEqual(target);
    expect(service.getMappingProjection(runtime).text.resolved).toEqual(target);
    revision = 'r2';
    await service.discover();
    const next = await service.selectWorkflow('wf');
    expect(service.getMappingProjection(next).text.resolved).toBeNull();
  });

  it('requires an explicit revision-scoped Mask binding from a writable upload-image candidate', async () => {
    const maskForm: WorkflowForm = {
      nodes: [{
        nodeId: 'images', title: '# Images', label: 'Images', order: 0, active: true, visible: true,
        widgets: [
          { ref: { nodeId: 'images', inputName: 'primary' }, kind: 'upload-image', label: 'Primary', writable: true, visible: false, order: 0 },
          { ref: { nodeId: 'images', inputName: 'edit_region' }, kind: 'upload-image', label: 'Edit Region', writable: true, visible: false, order: 1 },
          { ref: { nodeId: 'images', inputName: 'mask_by_name_only' }, kind: 'string', label: 'Mask', writable: true, visible: true, order: 2 },
        ],
      }],
    };
    let revision = 'r1';
    const repo = createInMemoryComfyUiStateRepository({ baseUrl: 'https://example.test', selectedWorkflowId: null, ambiguousMappingsByRevision: {} });
    const service = createComfyUiManagementService({
      state: repo,
      cache: createComfyUiWorkflowRuntimeCache(),
      ports: {
        discover: async () => [{ workflowId: 'wf', displayName: 'WF', remotePath: 'wf.json', revision }],
        load: async () => ({ identity: { workflowId: 'wf', displayName: 'WF', remotePath: 'wf.json', groupPath: [], revision }, document: { kind: 'api', graph: {} }, form: maskForm }),
      },
    });
    await service.discover();
    const runtime = await service.selectWorkflow('wf');
    expect(service.getMappingProjection(runtime).mask).toEqual({ requiresExplicitSelection: true });
    await expect(service.setMaskBinding('wf', 'r1', {
      transport: 'separate-image-input', inputRef: { nodeId: 'images', inputName: 'mask_by_name_only' }, polarity: 'white-edit',
    })).rejects.toThrow('explicit upload-image input');
    await service.setMapping('wf', 'r1', 'image', { nodeId: 'images', inputName: 'primary' });
    await expect(service.setMaskBinding('wf', 'r1', {
      transport: 'separate-image-input', inputRef: { nodeId: 'images', inputName: 'primary' }, polarity: 'white-edit',
    })).rejects.toThrow('must not replace the Primary image input');
    await service.setMaskBinding('wf', 'r1', {
      transport: 'separate-image-input', inputRef: { nodeId: 'images', inputName: 'edit_region' }, polarity: 'black-edit',
    });
    expect(service.getMappingProjection(runtime).mask.binding).toEqual({
      transport: 'separate-image-input', inputRef: { nodeId: 'images', inputName: 'edit_region' }, polarity: 'black-edit',
    });
    revision = 'r2';
    await service.discover();
    expect((await repo.load())?.ambiguousMappingsByRevision['wf@r1']?.mask).toBeUndefined();
  });

  it('admits complete workflow with optional prompt/first image and projects empty completion', async () => {
    const task: TaskRecord = {
      schemaVersion: 3, taskId: 'task', status: 'running', operation: 'text-to-image', prompt: '',
      attachments: [], outputs: [], placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z',
    };
    const intent: ComfyUiExecutionIntent = {
      connection: { baseUrl: 'https://example.test/comfyui', requestTimeoutMs: 30_000, observationTimeoutMs: 300_000 },
      source: { kind: 'api-graph', workflowId: 'wf', revision: 'r1', graph: {} }, images: [],
    };
    const backend = createComfyUiGenerationBackend({ runtime: { async getExecution() { return intent; } } });
    const admitted = await backend.admit({ taskId: 'task', backendId: 'comfyui', payload: { workflowId: 'wf', runningTask: task } });
    expect(comfyUiExecutionInput(admitted)).toMatchObject({ connection: { baseUrl: 'https://example.test/comfyui' }, source: { revision: 'r1' }, images: [] });
    const projected = await backend.projectTerminal({ admitted, runningTask: admitted.runningTask, job: { id: 'job', status: 'completed', input: admitted.execution.input, output: { comfyui: { outputs: [], warnings: [] } }, error: undefined, createdAt: task.createdAt, updatedAt: task.updatedAt } });
    expect(projected.status).toBe('completed');
    expect(projected.outputs).toEqual([]);

    const failed = await backend.projectTerminal({
      admitted,
      runningTask: admitted.runningTask,
      job: {
        id: 'job-failed', status: 'failed', input: admitted.execution.input, output: undefined,
        error: {
          category: 'execution', message: 'ComfyUI execution failed.',
          details: {
            code: 'execution-failed',
            executionError: { nodeId: '12', nodeType: 'KSampler', message: 'BrokenPipeError: [Errno 32] Broken pipe' },
          },
        },
        createdAt: task.createdAt, updatedAt: task.updatedAt,
      },
    });
    expect(failed).toMatchObject({
      status: 'failed',
      error: {
        category: 'execution',
        code: 'execution-failed',
        executionError: { nodeId: '12', nodeType: 'KSampler', message: 'BrokenPipeError: [Errno 32] Broken pipe' },
      },
    });
  });

  it('reconstructs ComfyUI retry Mask from Task Edit Region', async () => {
    const task: TaskRecord = {
      schemaVersion: 3, taskId: 'task-mask-retry', status: 'running', operation: 'image-edit', prompt: 'edit',
      attachments: [{ kind: 'photoshop-layer', attachmentId: 'primary', asset: { ref: { kind: 'hostObject', ref: 'primary-image', mimeType: 'image/png' } } }],
      editRegion: {
        targetAttachmentId: 'primary',
        source: { kind: 'photoshop-user-layer-mask', documentId: 42, layerId: 7 },
        geometry: { sourceBounds: { left: 0, top: 0, right: 100, bottom: 100 }, targetWidth: 100, targetHeight: 100 },
        mask: { ref: { kind: 'hostObject', ref: 'task-mask', mimeType: 'image/png' }, width: 100, height: 100 },
        encoding: 'grayscale-png', bitDepth: 8, polarity: 'white-edit',
      },
      outputs: [], placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z',
    };
    const intent: ComfyUiExecutionIntent = {
      connection: { baseUrl: 'https://example.test/comfyui', requestTimeoutMs: 30_000, observationTimeoutMs: 300_000 },
      source: { kind: 'api-graph', workflowId: 'wf', revision: 'r1', graph: {} }, images: [],
    };
    const backend = createComfyUiGenerationBackend({ runtime: { async getExecution() { return intent; } }, now: () => '2026-07-19T00:01:00.000Z' });
    const admitted = await backend.admit({
      taskId: task.taskId,
      backendId: 'comfyui',
      payload: {
        workflowId: 'wf',
        revision: 'r1',
        images: [{ storedRef: { kind: 'hostObject', ref: 'primary-image', mimeType: 'image/png' }, width: 100, height: 100 }],
        mask: {
          asset: { storedRef: { kind: 'hostObject', ref: 'stale-job-mask', mimeType: 'image/png' }, width: 100, height: 100 },
          binding: { transport: 'separate-image-input', inputRef: { nodeId: 'mask', inputName: 'image' }, polarity: 'white-edit' },
        },
        runningTask: task,
      },
    });
    const failedTask: TaskRecord = {
      ...admitted.runningTask,
      status: 'failed', latestJobId: 'job-mask-retry', outputs: [],
      error: { category: 'execution', message: 'failed' }, finishedAt: '2026-07-19T00:02:00.000Z',
    };
    const retry = await backend.retry?.({
      task: failedTask,
      latestJob: {
        id: 'job-mask-retry', status: 'failed', input: admitted.execution as unknown as Record<string, unknown>, output: undefined,
        error: { category: 'execution', message: 'failed' },
        createdAt: task.createdAt, updatedAt: '2026-07-19T00:02:00.000Z',
      },
    });

    expect(comfyUiExecutionInput(retry!)).toMatchObject({
      mask: {
        asset: { storedRef: { kind: 'hostObject', ref: 'task-mask', mimeType: 'image/png' }, width: 100, height: 100 },
        binding: { transport: 'separate-image-input', inputRef: { nodeId: 'mask', inputName: 'image' }, polarity: 'white-edit' },
      },
    });
    expect(retry?.runningTask.editRegion).toEqual(task.editRegion);
  });
});

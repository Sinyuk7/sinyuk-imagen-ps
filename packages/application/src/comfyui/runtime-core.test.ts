import { describe, expect, it } from 'vitest';
import {
  comfyUiBaseUrlCandidates,
  joinComfyUiRoute,
  normalizeComfyUiBaseUrl,
  createComfyUiManagementService,
} from './management.js';
import {
  createComfyUiWorkflowDraftStore,
  createComfyUiWorkflowRuntimeCache,
  createInMemoryComfyUiStateRepository,
} from './repositories.js';
import { collectWorkflowInputCandidates, composeWorkflowMutations, projectWorkflowMapping, resolveWorkflowMapping } from './workflow-policy.js';
import { createComfyUiGenerationBackend, comfyUiExecutionInput } from './backend.js';
import type { ComfyUiExecutionIntent } from './types.js';
import type { TaskRecord } from '../task.js';
import type { LoadedWorkflowRuntime, WorkflowForm } from './types.js';

const form: WorkflowForm = {
  nodes: [{
    nodeId: '1', title: '# Prompt', label: 'Prompt', order: 0, active: true, visible: true,
    widgets: [{ ref: { nodeId: '1', inputName: 'text' }, kind: 'string', label: 'Text', workflowValue: 'saved', writable: true, visible: true, order: 0 }],
  }],
};

describe('ComfyUI runtime core', () => {
  it('normalizes singleton URL and preserves reverse-proxy path', () => {
    expect(normalizeComfyUiBaseUrl('https://example.test/comfyui/')).toBe('https://example.test/comfyui');
    expect(joinComfyUiRoute('https://example.test/comfyui', ['', 'prompt'].join('/'))).toBe('https://example.test/comfyui/prompt');
    expect(comfyUiBaseUrlCandidates('example.test/comfyui')).toEqual(['https://example.test/comfyui', 'http://example.test/comfyui']);
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
    const empty = collectWorkflowInputCandidates({ nodes: [] });
    const unused = projectWorkflowMapping(empty, { text: null, image: null }, { prompt: 'hello', attachments: [{} as never] });
    expect(unused.text.notice).toBe('此 Workflow 不使用当前提示词');
    expect(unused.image.notice).toBe('此 Workflow 未识别到图片输入，附件不会发送');
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

  it('admits complete workflow with optional prompt/first image and projects empty completion', async () => {
    const task: TaskRecord = {
      schemaVersion: 2, taskId: 'task', status: 'running', operation: 'text-to-image', prompt: '',
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
  });
});

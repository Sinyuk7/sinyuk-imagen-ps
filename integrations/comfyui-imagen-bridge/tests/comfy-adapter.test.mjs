import assert from 'node:assert/strict';
import test from 'node:test';

import { createComfyAdapter } from '../web/comfy-adapter.mjs';

const limits = {
  maxMessageBytes: 2_000_000,
  maxWorkflowPathBytes: 512,
  maxWorkflowListEntries: 1_000,
  maxIdChars: 128,
};

test('adapter exposes the native Workflow id without replacing its stable catalog id', async () => {
  const app = { graph: { _nodes: [] }, async loadGraphData() {} };
  const api = {
    async listUserDataFullInfo() { return [{ path: 'saved/workflow.json' }]; },
    async getUserData() {
      return { ok: true, async text() { return JSON.stringify({ id: 'native-workflow-id', nodes: [] }); } };
    },
  };
  const adapter = createComfyAdapter({ app, api, versions: { frontendVersion: 'test', coreVersion: 'test' }, limits });

  const [workflow] = await adapter.discoverWorkflows();
  assert.deepEqual({ ...workflow, revision: undefined }, {
    workflowId: 'workflow:saved/workflow.json',
    nativeWorkflowId: 'native-workflow-id',
    displayName: 'workflow',
    remotePath: 'saved/workflow.json',
    revision: undefined,
  });
  assert.match(workflow.revision, /^rev-[a-f\d]+$/u);
});

test('adapter projects bounded Canvas Form values without exposing unsafe widgets', async () => {
  const graph = {
    _nodes: [
      {
        id: 1,
        type: 'PrimitiveNode',
        title: '# Parameters',
        mode: 0,
        widgets: [
          { name: 'prompt', type: 'text', value: 'saved', options: { multiline: true } },
          { name: 'enabled', type: 'toggle', value: true },
          { name: 'custom', type: 'custom', value: { unsafe: true } },
        ],
      },
      {
        id: 2,
        type: 'LoadImage',
        title: '# Image Input',
        mode: 0,
        widgets: [
          { name: 'image', type: 'combo', value: 'input.png' },
          { name: 'upload', type: 'button', value: 'image' },
        ],
      },
    ],
    setDirtyCanvas() {},
  };
  const app = { graph, async loadGraphData() {} };
  const api = {
    async listUserDataFullInfo() { return []; },
    async getUserData() { return { ok: true, async text() { return JSON.stringify({ nodes: [] }); } }; },
  };
  const adapter = createComfyAdapter({ app, api, versions: { frontendVersion: 'test', coreVersion: 'test' }, limits });
  const token = await adapter.openWorkflow('workflow.json');
  const form = await adapter.formValues(token);
  assert.deepEqual(form.nodes[0].widgets.map((widget) => [widget.kind, widget.visible, widget.workflowValue]), [
    ['multiline-string', true, 'saved'],
    ['boolean', true, true],
    ['unsupported', false, undefined],
  ]);
  assert.deepEqual(form.nodes[1].widgets.map((widget) => [widget.kind, widget.visible, widget.writable]), [
    ['upload-image', false, true],
    ['unsupported', false, false],
  ]);
});

test('adapter mutates rootGraph by inputName or widgetIndex and restores atomically', async () => {
  const dirty = [];
  const rootGraph = {
    _nodes: [{
      id: 1,
      type: 'PrimitiveNode',
      title: '# Parameters',
      mode: 0,
      widgets: [
        { name: 'prompt', type: 'text', value: 'saved' },
        { name: 'seed', type: 'number', value: 1 },
      ],
    }],
    setDirtyCanvas(...args) { dirty.push(args); },
  };
  const legacyGraph = { _nodes: [], setDirtyCanvas() { throw new Error('legacy graph used'); } };
  const app = { rootGraph, graph: legacyGraph, async loadGraphData() {} };
  const api = {
    async listUserDataFullInfo() { return []; },
    async getUserData() { return { ok: true, async text() { return JSON.stringify({ nodes: [] }); } }; },
  };
  const adapter = createComfyAdapter({ app, api, versions: { frontendVersion: 'test', coreVersion: 'test' }, limits });
  const token = await adapter.openWorkflow('workflow.json');
  const restore = await adapter.setValues(token, { mutations: [
    { ref: { nodeId: '1', inputName: 'prompt' }, value: 'queued prompt' },
    { ref: { nodeId: '1', widgetIndex: 1 }, value: 42 },
  ] });

  assert.deepEqual(rootGraph._nodes[0].widgets.map((widget) => widget.value), ['queued prompt', 42]);
  assert.deepEqual(dirty, [[true, true]]);
  await restore();
  await restore();
  assert.deepEqual(rootGraph._nodes[0].widgets.map((widget) => widget.value), ['saved', 1]);
  assert.deepEqual(dirty, [[true, true], [true, true]]);
});

test('adapter rejects malformed, ambiguous, and partial mutations without changing widgets', async () => {
  const graph = {
    _nodes: [{
      id: 1,
      type: 'PrimitiveNode',
      title: '# Parameters',
      mode: 0,
      widgets: [
        { name: 'text', type: 'text', value: 'first' },
        { name: 'text', type: 'text', value: 'second' },
      ],
    }],
    setDirtyCanvas() { throw new Error('invalid mutation dirtied graph'); },
  };
  const app = { graph, async loadGraphData() {} };
  const api = {
    async listUserDataFullInfo() { return []; },
    async getUserData() { return { ok: true, async text() { return JSON.stringify({ nodes: [] }); } }; },
  };
  const adapter = createComfyAdapter({ app, api, versions: { frontendVersion: 'test', coreVersion: 'test' }, limits });
  const token = await adapter.openWorkflow('workflow.json');

  await assert.rejects(adapter.setValues(token, { mutations: [{ ref: { nodeId: '1', fieldName: 'text' }, value: 'bad' }] }), { message: 'invalid-request' });
  await assert.rejects(adapter.setValues(token, { mutations: [{ ref: { nodeId: '1', inputName: 'text' }, value: 'bad' }] }), { message: 'invalid-workflow' });
  await assert.rejects(adapter.setValues(token, { mutations: [
    { ref: { nodeId: '1', widgetIndex: 0 }, value: 'changed' },
    { ref: { nodeId: '1', widgetIndex: 99 }, value: 'bad' },
  ] }), { message: 'invalid-workflow' });
  await assert.rejects(adapter.setValues(token, { mutations: [
    { ref: { nodeId: '1', widgetIndex: 0 }, value: 'changed' },
    { ref: { nodeId: '1', widgetIndex: 0 }, value: 'changed again' },
  ] }), { message: 'invalid-request' });
  assert.deepEqual(graph._nodes[0].widgets.map((widget) => widget.value), ['first', 'second']);
});

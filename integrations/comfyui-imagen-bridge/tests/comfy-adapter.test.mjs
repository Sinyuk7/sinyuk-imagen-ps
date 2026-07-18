import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createComfyAdapter } from '../web/comfy-adapter.mjs';

const schema = JSON.parse(
  await readFile(new URL('../generated/workflow-contract.schema.json', import.meta.url), 'utf8'),
);
const limits = {
  maxMessageBytes: 2_000_000,
  maxWorkflowPathBytes: 512,
  maxWorkflowListEntries: 1_000,
  maxMutations: 16,
  maxIdChars: 128,
  maxConfigureTimeoutMs: 30_000,
};
const binding = {
  schemaVersion: 1,
  bindings: [
    { role: 'prompt', slot: 0, locator: { nodeId: '10', fieldName: 'text' } },
    { role: 'output-image', slot: 0, locator: { nodeId: '20', fieldName: 'images' } },
  ],
};
const type = {
  schemaVersion: 1,
  operation: 'text-to-image',
  entries: [
    { role: 'prompt', slot: 0, required: true, dataType: 'text' },
    { role: 'output-image', slot: 0, required: true, dataType: 'image' },
  ],
};

function storedWorkflow(overrides = {}) {
  return {
    nodes: [
      { id: 10, type: 'TextNode', widgets_values: ['old'] },
      { id: 20, type: 'SaveNode', widgets_values: [] },
      {
        id: 30,
        type: 'ImagenWorkflowBindingContract',
        inputs: { contract: binding },
      },
      {
        id: 31,
        type: 'ImagenWorkflowTypeContract',
        inputs: { contract: JSON.stringify(type) },
      },
      ...(overrides.nodes ?? []),
    ],
  };
}

function canvasGraph(workflow) {
  return {
    dirtyCalls: 0,
    _nodes: workflow.nodes.map((node) => {
      if (node.type === 'ImagenWorkflowBindingContract') {
        return {
          id: node.id,
          comfyClass: node.type,
          widgets: [{ name: 'contract', type: 'STRING', value: node.inputs.contract }],
        };
      }
      if (node.type === 'ImagenWorkflowTypeContract') {
        return {
          id: node.id,
          comfyClass: node.type,
          widgets: [{ name: 'contract', type: 'STRING', value: node.inputs.contract }],
        };
      }
      if (node.id === 10) {
        return { id: 10, type: 'TextNode', widgets: [{ name: 'text', type: 'STRING', value: 'old' }] };
      }
      return { id: node.id, type: node.type, widgets: [] };
    }),
    setDirtyCanvas() {
      this.dirtyCalls += 1;
    },
  };
}

function createHarness(workflow = storedWorkflow()) {
  const app = {
    graph: canvasGraph(workflow),
    async loadGraphData(value) {
      this.graph = canvasGraph(value);
    },
    async queuePrompt() {},
  };
  const api = {
    queuePrompt: async () => ({ prompt_id: 'prompt-1' }),
    async listUserDataFullInfo() {
      return [{ path: 'workflows/nested/workflow.json' }];
    },
    async getUserData() {
      return workflow;
    },
  };
  const adapter = createComfyAdapter({
    app,
    api,
    schema,
    versions: { frontendVersion: '1.45.20', coreVersion: '0.27.1' },
    limits,
  });
  return { app, api, adapter };
}

test('discovery validates exact contract nodes without returning workflow', async () => {
  const { adapter } = createHarness();
  const workflows = await adapter.discoverWorkflows();
  assert.equal(workflows.length, 1);
  assert.equal(workflows[0].remotePath, 'nested/workflow.json');
  assert.equal(workflows[0].contract.operation, 'text-to-image');
  assert.equal('nodes' in workflows[0], false);
});

test('discovery skips unrelated workflows without Imagen contract markers', async () => {
  const harness = createHarness();
  harness.api.listUserDataFullInfo = async () => [
    { path: 'workflows/plain/workflow.json' },
    { path: 'workflows/nested/workflow.json' },
  ];
  harness.api.getUserData = async (path) => (
    path === 'workflows/plain/workflow.json'
      ? { nodes: [{ id: 1, type: 'KSampler', widgets_values: [] }] }
      : storedWorkflow()
  );

  const workflows = await harness.adapter.discoverWorkflows();
  assert.deepEqual(workflows.map((workflow) => workflow.remotePath), ['nested/workflow.json']);
});

test('exact open, operation-bound configure, widget mutation, and restore', async () => {
  const { app, adapter } = createHarness();
  const controller = new AbortController();
  const token = await adapter.openWorkflow('nested/workflow.json', {
    operationId: 'op-1',
    signal: controller.signal,
  });
  await adapter.waitForConfigure(token, { operationId: 'op-1', signal: controller.signal });
  const contract = await adapter.readWorkflowContract(token);
  assert.equal((await adapter.validateCanonicalContract(contract)).ok, true);
  const promptWidget = app.graph._nodes.find((node) => node.id === 10).widgets[0];
  const restore = await adapter.applyMutations(
    token,
    [{ entry: contract.entries[0], locator: contract.entries[0].locator, value: 'new prompt' }],
    { operationId: 'op-1', signal: controller.signal },
  );
  assert.equal(promptWidget.value, 'new prompt');
  await restore();
  assert.equal(promptWidget.value, 'old');
  assert.equal(app.graph.dirtyCalls, 2);
});

test('missing or duplicate contract/widget targets fail closed', async () => {
  const duplicate = storedWorkflow({
    nodes: [{ id: 32, type: 'ImagenWorkflowBindingContract', inputs: { contract: binding } }],
  });
  await assert.rejects(
    createHarness(duplicate).adapter.discoverWorkflows(),
    (error) => error.code === 'invalid-contract',
  );

  const { adapter } = createHarness();
  const controller = new AbortController();
  const token = await adapter.openWorkflow('nested/workflow.json', {
    operationId: 'op-2',
    signal: controller.signal,
  });
  const contract = await adapter.readWorkflowContract(token);
  await assert.rejects(
    adapter.applyMutations(
      token,
      [{
        entry: contract.entries[0],
        locator: { nodeId: 'missing', fieldName: 'text' },
        value: 'new prompt',
      }],
      { operationId: 'op-2', signal: controller.signal },
    ),
    (error) => error.code === 'invalid-contract',
  );
});

test('unsafe discovery path is rejected before userdata fetch', async () => {
  const harness = createHarness();
  let reads = 0;
  harness.api.listUserDataFullInfo = async () => [{ path: 'workflows/../secret.json' }];
  harness.api.getUserData = async () => {
    reads += 1;
    return storedWorkflow();
  };
  await assert.rejects(
    harness.adapter.discoverWorkflows(),
    (error) => error.code === 'invalid-workflow',
  );
  assert.equal(reads, 0);
});

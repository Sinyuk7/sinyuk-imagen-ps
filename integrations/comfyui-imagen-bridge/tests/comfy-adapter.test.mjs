import assert from 'node:assert/strict';
import test from 'node:test';

import { createComfyAdapter } from '../web/comfy-adapter.mjs';

const limits = {
  maxMessageBytes: 2_000_000,
  maxWorkflowPathBytes: 512,
  maxWorkflowListEntries: 1_000,
};

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
        widgets: [{ name: 'image', type: 'combo', value: 'input.png' }],
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
  assert.deepEqual(form.nodes[1].widgets.map((widget) => [widget.kind, widget.visible]), [['upload-image', false]]);
});

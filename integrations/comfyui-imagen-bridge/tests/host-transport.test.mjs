import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePageHostTransport } from '../web/host-transport.mjs';

test('UXP page transport reports diagnostics through the same uxpHost channel', () => {
  const messages = [];
  const uxpHost = { postMessage(value) { messages.push(value); } };
  const transport = resolvePageHostTransport({ uxpHost, parent: null }, {
    origin: 'com.imagen-ps.panel', sourceId: 'source', loadId: 'load',
  });

  transport.diagnostic('listener-attached');
  assert.deepEqual(messages, [{ type: 'imagen-ps.bridge.diagnostic', stage: 'listener-attached' }]);
});

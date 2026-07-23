import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import { attachBridgeWindow, createBridgeRuntime } from './bridge-runtime.mjs?v=1.0.3';
import { createComfyAdapter } from './comfy-adapter.mjs?v=1.0.3';
import { resolvePageHostTransport } from './host-transport.mjs?v=1.0.3';

const PAGE_RUNTIME = Symbol.for('imagen-ps.comfyui-bridge.page-runtime');
function sessionIdentity() { const params = new URLSearchParams(window.location.search); return { origin: params.get('imagenOrigin') ?? '', sourceId: params.get('imagenSourceId') ?? '', loadId: params.get('imagenLoadId') ?? '' }; }
function pageDiagnostic(transport, stage) { console.info('imagen-ps bridge diagnostic', { stage }); transport?.diagnostic?.(stage); }
app.registerExtension({ name: 'imagen-ps.comfyui-bridge', async setup() {
  if (globalThis[PAGE_RUNTIME] !== undefined) { console.info('imagen-ps bridge diagnostic', { stage: 'already-initialized' }); return; }
  const identity = sessionIdentity(); const transport = resolvePageHostTransport(window, identity);
  if (!identity.sourceId || !identity.loadId) { console.warn('imagen-ps bridge diagnostic', { stage: 'missing-identity' }); return; }
  if (transport === undefined) { console.warn('imagen-ps bridge diagnostic', { stage: 'transport-unavailable' }); return; }
  try {
    const config = { capabilities: { nativeQueue: true, receiptObserver: true, workflowDiscovery: true }, limits: { maxMessageBytes: 2_000_000, maxWorkflowPathBytes: 512, maxWorkflowListEntries: 1_000, maxMutations: 16, maxIdChars: 128, maxConfigureTimeoutMs: 30_000 } };
    const adapter = createComfyAdapter({ app, api, versions: { frontendVersion: 'unknown', coreVersion: 'unknown' }, limits: config.limits });
    const runtime = createBridgeRuntime({ identity, compatibility: { protocolVersion: 1, bridgeVersion: '1.0.0', frontendVersion: 'unknown', coreVersion: 'unknown' }, config, adapter, expectedSource: transport.expectedSource });
    globalThis[PAGE_RUNTIME] = true;
    pageDiagnostic(transport, 'transport-ready');
    const detach = attachBridgeWindow({ runtime, windowObject: window, reply: transport.reply, onMessage: () => pageDiagnostic(transport, 'message-received'), onResponse: () => pageDiagnostic(transport, 'response-sent') });
    pageDiagnostic(transport, 'listener-attached');
    const cleanup = () => { detach(); void runtime.dispose(); delete globalThis[PAGE_RUNTIME]; };
    window.addEventListener('pagehide', cleanup, { once: true }); window.addEventListener('beforeunload', cleanup, { once: true });
  } catch { delete globalThis[PAGE_RUNTIME]; pageDiagnostic(transport, 'setup-failed'); }
} });

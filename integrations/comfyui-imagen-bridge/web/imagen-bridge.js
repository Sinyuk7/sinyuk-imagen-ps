import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import { attachBridgeWindow, createBridgeRuntime } from './bridge-runtime.mjs';
import { createComfyAdapter } from './comfy-adapter.mjs';
import { resolvePageHostTransport } from './host-transport.mjs';

const STATUS_PATH = '/imagen-ps/bridge/status';
const MAX_STATUS_BYTES = 8_192;
const PAGE_RUNTIME = Symbol.for('imagen-ps.comfyui.page-runtime');

async function boundedJsonWithBytes(response, maxBytes) {
  if (!response || response.ok !== true) throw new Error('bridge-incompatible');
  const text = await response.text();
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > maxBytes) throw new Error('bridge-incompatible');
  return { value: JSON.parse(text), bytes };
}

async function boundedJson(response, maxBytes) {
  return (await boundedJsonWithBytes(response, maxBytes)).value;
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('bridge-incompatible');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function sessionIdentity() {
  const params = new URLSearchParams(window.location.search);
  return {
    origin: params.get('imagenOrigin') ?? '',
    sourceId: params.get('imagenSourceId') ?? '',
    loadId: params.get('imagenLoadId') ?? '',
  };
}

app.registerExtension({
  name: 'imagen-ps.comfyui-bridge',
  async setup() {
    if (globalThis[PAGE_RUNTIME] !== undefined) return;
    globalThis[PAGE_RUNTIME] = { pending: true };
    const identity = sessionIdentity();
    const transport = resolvePageHostTransport(window, identity);
    if (!identity.sourceId || !identity.loadId || transport === undefined) {
      delete globalThis[PAGE_RUNTIME];
      return;
    }

    try {
      const status = await boundedJson(await api.fetchApi(STATUS_PATH), MAX_STATUS_BYTES);
      if (status.ok !== true || status.compatible !== true) throw new Error('bridge-incompatible');
      const schemaUrl = new URL('./generated/workflow-contract.schema.json', import.meta.url);
      const schemaArtifact = await boundedJsonWithBytes(await fetch(schemaUrl), 131_072);
      if (await sha256(schemaArtifact.bytes) !== status.contractSchemaSha256) {
        throw new Error('bridge-incompatible');
      }
      const schema = schemaArtifact.value;
      const compatibility = {
        protocolVersion: status.protocolVersion,
        bridgeVersion: status.bridgeVersion,
        frontendVersion: status.frontendVersion,
        coreVersion: status.coreVersion,
        contractSchemaVersion: status.contractSchemaVersion,
        contractSchemaSha256: status.contractSchemaSha256,
      };
      const config = { capabilities: status.capabilities, limits: status.limits };
      const adapter = createComfyAdapter({
        app,
        api,
        schema,
        versions: status.detected,
        limits: status.limits,
      });
      const runtime = createBridgeRuntime({
        identity,
        compatibility,
        config,
        adapter,
        expectedSource: transport.expectedSource,
      });
      globalThis[PAGE_RUNTIME] = true;
      const detach = attachBridgeWindow({
        runtime,
        windowObject: window,
        reply: transport.reply,
      });
      const cleanup = () => {
        detach();
        void runtime.dispose();
        delete globalThis[PAGE_RUNTIME];
        window.removeEventListener('pagehide', cleanup);
        window.removeEventListener('beforeunload', cleanup);
      };
      window.addEventListener('pagehide', cleanup, { once: true });
      window.addEventListener('beforeunload', cleanup, { once: true });
    } catch {
      delete globalThis[PAGE_RUNTIME];
      // 不暴露 runtime、path 或 payload；incompatible tuple 保持 fail closed。
    }
  },
});

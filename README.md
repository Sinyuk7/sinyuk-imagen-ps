# ComfyUI Imagen Bridge

Page-side bridge extension for the frontend-managed ComfyUI workflow spike. This build targets the live-tested official tuple: `ComfyUI_frontend v1.45.20` (`7bd9f8b0d0b854ccb5a947623468f36a392ea0ff`), `ComfyUI v0.27.1` (`c2638ce6c00e3426c48d56a775bc46e9a8464094`), and protocol `1.0`.

The native preparation contract is grounded in the official [`app.queuePrompt()` implementation](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.45.20/src/scripts/app.ts) and the official [`api.queuePrompt()` transport](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.45.20/src/scripts/api.ts). Workflow discovery and reads use the same tagged frontend API.

## Install

1. Pin the server to `ComfyUI v0.27.1` with `ComfyUI_frontend v1.45.20`.
2. Copy this directory to `ComfyUI/custom_nodes/ComfyUI-Imagen-Bridge`.
3. Restart ComfyUI and reload its frontend.
4. Probe `GET /imagen-ps/bridge/status` and confirm `installed: true` with the pinned bridge, frontend, and core versions.
5. Confirm the host receives a successful page `handshake` before enabling frontend-managed workflows.

The custom node exposes no Python nodes. `WEB_DIRECTORY` installs the browser extension from `web/`. The status probe proves only that the server-side custom node loaded. It does not prove iframe/WebView page readiness, Canvas availability, or a successful bridge handshake.

## Protocol

Requests use this fixed outer envelope:

```js
{
  channel: 'imagen-comfyui-frontend-bridge',
  protocolVersion: '1.0',
  loadId,
  type: 'bridge.request',
  payload: {
    requestId,
    identity: { origin, sourceId: 'imagen-comfyui-page', loadId },
    command,
    payload,
  },
}
```

Responses use the same channel, protocol version, and load identity with `type: 'bridge.response'`. Their nested payload echoes `requestId` and `identity`, then carries either `{ ok: true, payload }` or `{ ok: false, errorCode }`. The only remote error codes are `bridge-missing`, `workflow-missing`, `runtime-not-ready`, `workflow-load-failed`, `hook-failed`, `compile-failed`, `api-graph-invalid`, and `reset-failed`.

The fixed commands are:

- `handshake`
- `list-workflows`
- `prepare-workflow`
- `reset`
- `dispose`

The first valid handshake pins the host message origin, source object, reply mechanism, and nested identity. The outer and nested `loadId` values must match. Later mismatches are ignored. Messages are limited to 2 MB, canonical graphs to 1.75 MB, workflow paths to 512 UTF-8 bytes, and workflow lists to 1,000 entries.

Handshake success reports `bridgeProtocolVersion: '1.0'`, `bridgeVersion: '1.0.0'`, `frontendVersion: '1.45.20'`, `comfyCoreVersion: '0.27.1'`, `messageSchemaVersion: 1`, message/path/graph limits plus `maxExtraDataBytes: 65536` and `maxExtraDataDepth: 16`, and these capabilities: `workflow-list`, `workflow-open`, `runtime-readiness`, `widget-mutation`, `native-prequeue`, `compile-api-graph`, `reset`, and `dispose`. Core evidence comes from `/system_stats`; frontend evidence comes from `/system_stats` when present, otherwise the frontend runtime's `window.__COMFYUI_FRONTEND_VERSION__`. Missing or mismatched evidence fails closed and removes the compile-only capabilities. Workflow discovery returns `{ paths: string[] }`; these canonical paths never include the internal `workflows/` user-data prefix.

`prepare-workflow` requires a canonical no-prefix `remotePath`, `compileOnly: true`, and `nativePreparationSequence: ['beforeQueued', 'promoted-controls', 'graphToPrompt']`. Optional widget mutation is restricted to `{ mutations: [{ nodeId, widgetName, value }] }`, with at most 16 exact node/widget locators and string, finite number, or boolean values. The bridge does not accept arbitrary property paths, scripts, or functions. It loads the remote user-data workflow, applies these in-memory mutations, and invokes the official `app.queuePrompt(0, 1)` lifecycle while temporarily intercepting `api.queuePrompt` and `app.ui.queue.update`. It captures only `promptData.output` plus bounded JSON `promptData.extra_data`; it never returns or creates `prompt_id` or `client_id`. This preserves native widget `beforeQueued`, promoted-control handling, and `app.graphToPrompt()` while producing zero frontend `/prompt` submissions. Both methods are restored in `finally`; if either seam cannot be replaced, preparation fails closed.

## Host Gate

Offline tests do not establish real-host compatibility. Before release, verify against the pinned frontend and a real ComfyUI server:

- reported frontend/core versions and extension readiness;
- Chrome parent and Photoshop UXP `window.uxpHost` message source/origin behavior;
- nested workflow discovery and workflow loading;
- native widget and promoted-control parity with the frontend Queue action;
- zero frontend `/prompt` requests and one later App-owned submission;
- reset/dispose behavior after success, error, reload, and panel destruction;
- graph/message limits with representative production workflows.

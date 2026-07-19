import { assertCanonicalWorkflowPath, BridgeProtocolError } from './bridge-runtime.mjs';
import { observeNativeQueueReceipt } from './queue-observer.mjs';

const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && ([Object.prototype, null].includes(Object.getPrototypeOf(value)));
async function responseJson(value, maxBytes) { if (value && typeof value.text === 'function') { if (value.ok !== true) throw new BridgeProtocolError('invalid-workflow'); const text = await value.text(); if (new TextEncoder().encode(text).byteLength > maxBytes) throw new BridgeProtocolError('limit-exceeded'); try { return JSON.parse(text); } catch { throw new BridgeProtocolError('invalid-workflow'); } } if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) throw new BridgeProtocolError('limit-exceeded'); return value; }
function listedPath(entry) { const value = typeof entry === 'string' ? entry : entry?.path; if (typeof value !== 'string') throw new BridgeProtocolError('invalid-workflow'); return value.startsWith('workflows/') ? value.slice(10) : value; }
function nodes(app) { if (!app.graph || !Array.isArray(app.graph._nodes)) throw new BridgeProtocolError('bridge-incompatible'); return app.graph._nodes; }
function revision(value) { const text = JSON.stringify(value); let hash = 2166136261; for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `rev-${(hash >>> 0).toString(16)}`; }
function primitive(value) { return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined; }
function widgetKind(node, widget) {
  const name = typeof widget?.name === 'string' ? widget.name.toLowerCase() : '';
  const type = typeof widget?.type === 'string' ? widget.type.toLowerCase() : '';
  if (node?.type === 'LoadImage' && name === 'image') return 'upload-image';
  if (type === 'toggle' || typeof widget?.value === 'boolean') return 'boolean';
  if (Array.isArray(widget?.options?.values)) return 'combo';
  if (typeof widget?.value === 'number') return name.includes('seed') ? 'seed' : 'number';
  if (typeof widget?.value === 'string') return widget?.options?.multiline === true ? 'multiline-string' : 'string';
  return 'unsupported';
}
function formValues(app) {
  return { nodes: nodes(app).map((node, nodeOrder) => {
    const title = typeof node.title === 'string' ? node.title : String(node.type ?? '');
    const active = node.mode !== 2 && node.mode !== 4;
    const exposed = active && title.startsWith('#') && title.slice(1).trim().length > 0;
    const widgets = Array.isArray(node.widgets) ? node.widgets.map((widget, order) => {
      const kind = widgetKind(node, widget);
      const value = primitive(widget?.value);
      const writable = kind !== 'unsupported';
      return {
        ref: { nodeId: String(node.id), widgetIndex: order },
        kind,
        label: typeof widget?.name === 'string' ? widget.name : `widget-${order}`,
        ...(value === undefined ? {} : { workflowValue: value }),
        writable,
        visible: exposed && !['upload-image', 'unsupported'].includes(kind),
        order,
        ...(Array.isArray(widget?.options?.values) ? { options: widget.options.values.filter((item) => typeof item === 'string').slice(0, 512) } : {}),
        ...(typeof widget?.options?.min === 'number' ? { min: widget.options.min } : {}),
        ...(typeof widget?.options?.max === 'number' ? { max: widget.options.max } : {}),
        ...(typeof widget?.options?.step === 'number' ? { step: widget.options.step } : {}),
      };
    }) : [];
    return { nodeId: String(node.id), title, label: title.startsWith('#') ? title.slice(1).trim() : title, order: nodeOrder, active, visible: exposed && widgets.some((widget) => widget.visible), widgets };
  }) };
}
function applyValues(app, payload) { const changes = []; const mutations = Array.isArray(payload.mutations) ? payload.mutations : []; for (const mutation of mutations) { if (!plain(mutation) || !plain(mutation.ref) || typeof mutation.ref.nodeId !== 'string' || typeof mutation.ref.fieldName !== 'string') throw new BridgeProtocolError('invalid-request'); const node = nodes(app).find((item) => String(item.id) === mutation.ref.nodeId); const widget = node?.widgets?.find((item) => item?.name === mutation.ref.fieldName); if (!widget) throw new BridgeProtocolError('invalid-workflow'); changes.push({ widget, value: widget.value }); widget.value = mutation.value; } app.graph.setDirtyCanvas?.(true, true); return async () => { for (const change of changes.reverse()) change.widget.value = change.value; app.graph.setDirtyCanvas?.(true, true); }; }

export function createComfyAdapter({ app, api, versions, limits }) {
  if (!app || typeof app.loadGraphData !== 'function' || !api || typeof api.listUserDataFullInfo !== 'function' || typeof api.getUserData !== 'function') throw new BridgeProtocolError('bridge-incompatible');
  let current = null;
  const readWorkflow = async (remotePath) => { assertCanonicalWorkflowPath(remotePath, limits); return responseJson(await api.getUserData(`workflows/${remotePath}`), limits.maxMessageBytes); };
  return {
    async getVersions() { return { frontendVersion: versions.frontendVersion, coreVersion: versions.coreVersion }; },
    async discoverWorkflows() { const result = await api.listUserDataFullInfo('workflows'); const entries = Array.isArray(result) ? result : result?.files; if (!Array.isArray(entries) || entries.length > limits.maxWorkflowListEntries) throw new BridgeProtocolError('invalid-workflow'); const workflows = []; for (const entry of entries) { if (entry?.isDirectory === true || entry?.type === 'directory') continue; const remotePath = listedPath(entry); assertCanonicalWorkflowPath(remotePath, limits); const document = await readWorkflow(remotePath); if (!Array.isArray(document?.nodes)) continue; const workflowId = `workflow:${remotePath}`; workflows.push({ workflowId, displayName: remotePath.split('/').at(-1).replace(/\.json$/u, ''), remotePath, revision: revision(document) }); } return workflows; },
    async openWorkflow(remotePath) { const workflow = await readWorkflow(remotePath); await app.loadGraphData(workflow); const token = { remotePath, revision: revision(workflow), graph: app.graph }; current = token; return token; },
    async formValues(token) { if (current !== token && token?.graph !== app.graph) throw new BridgeProtocolError('invalid-workflow'); return formValues(app); },
    async setValues(token, payload) { if (current !== token && token?.graph !== app.graph) throw new BridgeProtocolError('invalid-workflow'); return applyValues(app, payload); },
    async queueNativeOnce({ receiptTimeoutMs, signal }) { return observeNativeQueueReceipt({ app, api, receiptTimeoutMs, signal, maxIdChars: limits.maxIdChars }); },
    async resetOperation(_operationId, token) { if (current === token) current = null; },
    async dispose() { current = null; },
  };
}

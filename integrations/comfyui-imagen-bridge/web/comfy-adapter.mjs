import { assertCanonicalWorkflowPath, BridgeProtocolError } from './bridge-runtime.mjs?v=1.0.2';
import { observeNativeQueueReceipt } from './queue-observer.mjs?v=1.0.2';

const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && ([Object.prototype, null].includes(Object.getPrototypeOf(value)));
async function responseJson(value, maxBytes) { if (value && typeof value.text === 'function') { if (value.ok !== true) throw new BridgeProtocolError('invalid-workflow'); const text = await value.text(); if (new TextEncoder().encode(text).byteLength > maxBytes) throw new BridgeProtocolError('limit-exceeded'); try { return JSON.parse(text); } catch { throw new BridgeProtocolError('invalid-workflow'); } } if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) throw new BridgeProtocolError('limit-exceeded'); return value; }
function listedPath(entry) { const value = typeof entry === 'string' ? entry : entry?.path; if (typeof value !== 'string') throw new BridgeProtocolError('invalid-workflow'); return value.startsWith('workflows/') ? value.slice(10) : value; }
function rootGraph(app) { const graph = app.rootGraph ?? app.graph; if (!graph || !Array.isArray(graph._nodes)) throw new BridgeProtocolError('bridge-incompatible'); return graph; }
function nodes(app) { return rootGraph(app)._nodes; }
function revision(value) { const text = JSON.stringify(value); let hash = 2166136261; for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `rev-${(hash >>> 0).toString(16)}`; }
function nativeWorkflowId(value, limits) { const id = value?.id; return typeof id === 'string' && id.length > 0 && Array.from(id).length <= limits.maxIdChars && !/[\u0000-\u001f\u007f]/u.test(id) ? id : undefined; }
function primitive(value) { return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined; }
function widgetKind(node, widget) {
  const name = typeof widget?.name === 'string' ? widget.name.toLowerCase() : '';
  const type = typeof widget?.type === 'string' ? widget.type.toLowerCase() : '';
  if (node?.type === 'LoadImage') return name === 'image' ? 'upload-image' : 'unsupported';
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
function mutationTarget(app, mutation) {
  if (!plain(mutation) || !plain(mutation.ref) || Object.keys(mutation).some((key) => !['ref', 'value'].includes(key)) || Object.keys(mutation.ref).some((key) => !['nodeId', 'inputName', 'widgetIndex'].includes(key))) throw new BridgeProtocolError('invalid-request');
  const { nodeId, inputName, widgetIndex } = mutation.ref;
  if (typeof nodeId !== 'string' || nodeId.length === 0 || (inputName !== undefined && (typeof inputName !== 'string' || inputName.length === 0)) || (widgetIndex !== undefined && (!Number.isInteger(widgetIndex) || widgetIndex < 0)) || (inputName === undefined && widgetIndex === undefined) || !['string', 'number', 'boolean'].includes(typeof mutation.value)) throw new BridgeProtocolError('invalid-request');
  const matchingNodes = nodes(app).filter((item) => String(item.id) === nodeId);
  if (matchingNodes.length !== 1 || !Array.isArray(matchingNodes[0].widgets)) throw new BridgeProtocolError('invalid-workflow');
  const widgets = matchingNodes[0].widgets;
  const named = inputName === undefined ? undefined : widgets.filter((item) => item?.name === inputName);
  if (named !== undefined && named.length !== 1) throw new BridgeProtocolError('invalid-workflow');
  const indexed = widgetIndex === undefined ? undefined : widgets[widgetIndex];
  if (widgetIndex !== undefined && indexed === undefined) throw new BridgeProtocolError('invalid-workflow');
  if (named?.[0] !== undefined && indexed !== undefined && named[0] !== indexed) throw new BridgeProtocolError('invalid-workflow');
  return named?.[0] ?? indexed;
}
function applyValues(app, payload) {
  const mutations = Array.isArray(payload.mutations) ? payload.mutations : [];
  const targets = mutations.map((mutation) => ({ widget: mutationTarget(app, mutation), value: mutation.value }));
  if (new Set(targets.map((target) => target.widget)).size !== targets.length) throw new BridgeProtocolError('invalid-request');
  const changes = targets.map((target) => ({ widget: target.widget, value: target.widget.value }));
  for (const target of targets) target.widget.value = target.value;
  const graph = rootGraph(app);
  if (changes.length > 0) graph.setDirtyCanvas?.(true, true);
  let restored = false;
  return async () => {
    if (restored) return;
    restored = true;
    for (const change of changes.reverse()) change.widget.value = change.value;
    if (changes.length > 0) graph.setDirtyCanvas?.(true, true);
  };
}

export function createComfyAdapter({ app, api, versions, limits }) {
  if (!app || typeof app.loadGraphData !== 'function' || !api || typeof api.listUserDataFullInfo !== 'function' || typeof api.getUserData !== 'function') throw new BridgeProtocolError('bridge-incompatible');
  let current = null;
  const readWorkflow = async (remotePath) => { assertCanonicalWorkflowPath(remotePath, limits); return responseJson(await api.getUserData(`workflows/${remotePath}`), limits.maxMessageBytes); };
  return {
    async getVersions() { return { frontendVersion: versions.frontendVersion, coreVersion: versions.coreVersion }; },
    async discoverWorkflows() { const result = await api.listUserDataFullInfo('workflows'); const entries = Array.isArray(result) ? result : result?.files; if (!Array.isArray(entries) || entries.length > limits.maxWorkflowListEntries) throw new BridgeProtocolError('invalid-workflow'); const workflows = []; for (const entry of entries) { if (entry?.isDirectory === true || entry?.type === 'directory') continue; const remotePath = listedPath(entry); assertCanonicalWorkflowPath(remotePath, limits); const document = await readWorkflow(remotePath); if (!Array.isArray(document?.nodes)) continue; const workflowId = `workflow:${remotePath}`; const nativeId = nativeWorkflowId(document, limits); workflows.push({ workflowId, ...(nativeId === undefined ? {} : { nativeWorkflowId: nativeId }), displayName: remotePath.split('/').at(-1).replace(/\.json$/u, ''), remotePath, revision: revision(document) }); } return workflows; },
    async openWorkflow(remotePath) { const workflow = await readWorkflow(remotePath); await app.loadGraphData(workflow); const token = { remotePath, revision: revision(workflow), graph: rootGraph(app) }; current = token; return token; },
    async formValues(token) { if (current !== token || token?.graph !== rootGraph(app)) throw new BridgeProtocolError('invalid-workflow'); return formValues(app); },
    async setValues(token, payload) { if (current !== token || token?.graph !== rootGraph(app)) throw new BridgeProtocolError('invalid-workflow'); return applyValues(app, payload); },
    async queueNativeOnce({ receiptTimeoutMs, signal }) { return observeNativeQueueReceipt({ app, api, receiptTimeoutMs, signal, maxIdChars: limits.maxIdChars }); },
    async resetOperation(_operationId, token) { if (current === token) current = null; },
    async dispose() { current = null; },
  };
}

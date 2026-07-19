import type { ComfyUiPreparedUploads } from './assets.js';
import { buildComfyUiApiPrompt, buildComfyUiFrontendMutations } from './mutation.js';
import { convertComfyUiApiWorkflowToForm, type WorkflowForm } from './form.js';
import { createComfyUiBridgeHandshakeRequest, validateComfyUiBridgeHandshake, assertComfyUiBridgeIdentity, createComfyUiFrontendSubmitRequest, validateComfyUiFrontendReceipt } from './bridge.js';
import { createComfyUiExecutionError, normalizeComfyUiExecutionError } from './errors.js';
import type { ComfyUiAssetSink, ComfyUiExecutionClock, ComfyUiExecutionRequest, ComfyUiExecutionResult, ComfyUiFrontendBridgeResolver, ComfyUiHttpTransport, ComfyUiPromptHintSource, ComfyUiPromptHintSourceFactory } from './execution-types.js';
import { decodeJsonBytes, encodeJsonBytes, isPlainRecord, safeRuntimeId } from './internal/value.js';
import { downloadAndStoreComfyUiOutputs, observeKnownComfyUiPrompt } from './observation.js';

interface Shared { readonly transport: ComfyUiHttpTransport; readonly sink: ComfyUiAssetSink; readonly clock?: ComfyUiExecutionClock; readonly createRuntimeId?: (prefix: string) => string }
export interface ComfyUiApiGraphDriverDependencies extends Shared { readonly hintSourceFactory?: ComfyUiPromptHintSourceFactory }
export interface ComfyUiFrontendQueueDriverDependencies extends Shared { readonly bridgeResolver: ComfyUiFrontendBridgeResolver }
function runtimeId(deps: Shared, prefix: string): string { const id = deps.createRuntimeId?.(prefix) ?? safeRuntimeId(prefix); if (id.length === 0 || id.length > 128 || /[\u0000-\u001f\u007f]/.test(id)) throw createComfyUiExecutionError('prepare', 'invalid-workflow'); return id; }
async function finish(request: ComfyUiExecutionRequest, promptId: string, deps: Shared, hintSource?: ComfyUiPromptHintSource, signal?: AbortSignal): Promise<ComfyUiExecutionResult> {
  try {
    const observed = await observeKnownComfyUiPrompt({ connection: request.connection, promptId }, { transport: deps.transport, hintSource, clock: deps.clock }, signal);
    const downloaded = await downloadAndStoreComfyUiOutputs({ connection: request.connection, descriptors: observed.descriptors }, { transport: deps.transport, sink: deps.sink }, signal);
    return { outputs: downloaded.outputs, warnings: [...observed.warnings, ...downloaded.warnings] };
  } finally { hintSource?.dispose(); }
}
function parseApiReceipt(body: Uint8Array): { readonly promptId: string } {
  let value: unknown; try { value = decodeJsonBytes(body); } catch { throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true }); }
  if (!isPlainRecord(value)) throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
  if (value.node_errors !== undefined && isPlainRecord(value.node_errors) && Object.keys(value.node_errors).length > 0) throw createComfyUiExecutionError('submit', 'prompt-no-outputs');
  if (typeof value.prompt_id !== 'string' || value.prompt_id.length === 0 || value.prompt_id.length > 128) throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
  return { promptId: value.prompt_id };
}
function isNativeValidationRejection(body: Uint8Array): boolean {
  try {
    const value = decodeJsonBytes(body);
    return isPlainRecord(value)
      && isPlainRecord(value.node_errors)
      && Object.keys(value.node_errors).length > 0;
  } catch {
    return false;
  }
}

/** API driver: clone full graph, apply optional overrides, POST /prompt exactly once. */
export async function executeComfyUiApiGraph(request: ComfyUiExecutionRequest & { readonly source: Extract<ComfyUiExecutionRequest['source'], { readonly kind: 'api-graph' }> }, uploads: ComfyUiPreparedUploads, deps: ComfyUiApiGraphDriverDependencies, signal?: AbortSignal): Promise<ComfyUiExecutionResult> {
  const form: WorkflowForm = convertComfyUiApiWorkflowToForm(request.source.graph, request.source.objectInfo);
  const imageMutation = request.imageInputRef && uploads.imageValues[0]
    ? { ref: request.imageInputRef, value: uploads.imageValues[0] }
    : undefined;
  const mutations = imageMutation
    ? [...(request.mutations ?? []).filter((item) => item.ref.nodeId !== imageMutation.ref.nodeId || item.ref.inputName !== imageMutation.ref.inputName || item.ref.widgetIndex !== imageMutation.ref.widgetIndex), imageMutation]
    : request.mutations;
  const prompt = buildComfyUiApiPrompt(request.source.graph, form, { prompt: request.mutations ? undefined : request.prompt, imageValues: request.imageInputRef ? undefined : uploads.imageValues, mutations });
  const clientId = runtimeId(deps, 'comfy-client');
  let hint: ComfyUiPromptHintSource | undefined;
  try { hint = deps.hintSourceFactory ? await deps.hintSourceFactory.open({ origin: request.connection.baseUrl, clientId }, signal) : undefined; } catch { hint = undefined; }
  let response;
  try { const body = encodeJsonBytes({ prompt, client_id: clientId }); response = await deps.transport.request({ origin: request.connection.baseUrl, method: 'POST', path: '/prompt', headers: { 'content-type': 'application/json' }, body, timeoutMs: request.connection.requestTimeoutMs, maxResponseBytes: 16 * 1024 }, signal); } catch (error) { hint?.dispose(); throw normalizeComfyUiExecutionError(error, { stage: 'submit', code: 'submission-unknown', remoteMayContinue: true }); }
  if (response.status < 200 || response.status >= 300) {
    hint?.dispose();
    throw createComfyUiExecutionError('submit', isNativeValidationRejection(response.body) ? 'prompt-no-outputs' : 'submission-rejected');
  }
  const receipt = parseApiReceipt(response.body);
  return finish(request, receipt.promptId, deps, hint, signal);
}

/** Frontend driver: open exact saved workflow and native Queue once through Bridge. */
export async function executeComfyUiFrontendQueue(request: ComfyUiExecutionRequest & { readonly source: Extract<ComfyUiExecutionRequest['source'], { readonly kind: 'frontend-workflow' }> }, uploads: ComfyUiPreparedUploads, deps: ComfyUiFrontendQueueDriverDependencies, signal?: AbortSignal): Promise<ComfyUiExecutionResult> {
  const bridge = await deps.bridgeResolver.resolve(request.source.workflowId);
  if (!bridge) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  const identity = bridge.identity;
  const handshake = createComfyUiBridgeHandshakeRequest(identity, runtimeId(deps, 'bridge-request'));
  try { validateComfyUiBridgeHandshake(await bridge.exchange(handshake, signal), handshake.requestId, identity); } catch (error) { throw normalizeComfyUiExecutionError(error, { stage: 'prepare', code: 'bridge-incompatible' }); }
  const imageMutation = request.imageInputRef && uploads.imageValues[0]
    ? { ref: request.imageInputRef, value: uploads.imageValues[0] }
    : undefined;
  const mutations = imageMutation
    ? [...(request.mutations ?? []).filter((item) => item.ref.nodeId !== imageMutation.ref.nodeId || item.ref.inputName !== imageMutation.ref.inputName || item.ref.widgetIndex !== imageMutation.ref.widgetIndex), imageMutation]
    : request.mutations;
  const submission = createComfyUiFrontendSubmitRequest({ identity, workflowId: request.source.workflowId, revision: request.source.revision, remotePath: request.source.remotePath, mutations: buildComfyUiFrontendMutations(mutations), prompt: request.mutations ? undefined : request.prompt, imageValues: request.imageInputRef ? undefined : uploads.imageValues, configureTimeoutMs: Math.min(request.connection.requestTimeoutMs, 30_000), receiptTimeoutMs: Math.min(request.connection.observationTimeoutMs, 30_000), requestId: runtimeId(deps, 'bridge-request'), operationId: runtimeId(deps, 'comfy-operation') });
  let response: unknown;
  try { response = await bridge.exchange(submission.request, signal); } catch (error) { throw normalizeComfyUiExecutionError(error, { stage: 'submit', code: 'submission-unknown', remoteMayContinue: true }); }
  assertComfyUiBridgeIdentity(bridge.identity, identity, true);
  const receipt = validateComfyUiFrontendReceipt(response, submission.request.requestId, submission.operationId);
  return finish(request, receipt.promptId, deps, undefined, signal);
}

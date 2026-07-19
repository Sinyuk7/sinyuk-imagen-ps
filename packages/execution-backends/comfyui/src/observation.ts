import { createComfyUiExecutionError, normalizeComfyUiExecutionError } from './errors.js';
import { detectComfyUiImageMime } from './assets.js';
import type { ComfyUiAssetSink, ComfyUiExecutionClock, ComfyUiExecutionConnection, ComfyUiHttpResponse, ComfyUiHttpTransport, ComfyUiPromptHintSource } from './execution-types.js';
import { decodeJsonBytes, hasExactKeys, isPlainRecord, utf8ByteLength } from './internal/value.js';

export interface ComfyUiOutputDescriptor { readonly filename: string; readonly subfolder: string; readonly type: 'output' | 'temp' | 'input' }
export interface ComfyUiObservedOutputs { readonly descriptors: readonly ComfyUiOutputDescriptor[]; readonly warnings: readonly { readonly code: 'realtime-hint-unavailable' | 'unsafe-output-skipped'; readonly messageKey: string }[] }
export const defaultComfyUiExecutionClock: ComfyUiExecutionClock = { now: () => Date.now(), sleep: (ms, signal) => new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true }); }) };

function safePart(value: unknown, nested: boolean): value is string {
  return typeof value === 'string' && (nested || value.length > 0) && utf8ByteLength(value) <= 512 && !/[\u0000-\u001f\u007f\\%]/.test(value) && !value.startsWith('/') && value.split('/').every((part) => part !== '.' && part !== '..' && (nested || part.length > 0));
}
export function validateComfyUiOutputDescriptor(value: unknown): ComfyUiOutputDescriptor {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['filename', 'subfolder', 'type'])) throw createComfyUiExecutionError('observe', 'unsafe-output');
  if (!safePart(value.filename, false) || !safePart(value.subfolder, true) || !['output', 'temp', 'input'].includes(String(value.type))) throw createComfyUiExecutionError('observe', 'unsafe-output');
  return { filename: value.filename, subfolder: value.subfolder, type: value.type as ComfyUiOutputDescriptor['type'] };
}
function jsonResponse(response: ComfyUiHttpResponse, max: number): unknown {
  if (response.body.byteLength > max || response.status < 200 || response.status >= 300) throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
  try { return decodeJsonBytes(response.body); } catch { throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true }); }
}
function terminal(entry: Record<string, unknown>): boolean {
  return entry.status === 'completed' || entry.status === 'error' || entry.status === 'failed' || entry.status_str === 'success' || entry.status_str === 'error';
}
function collectHistory(value: unknown): ComfyUiObservedOutputs | undefined {
  if (!isPlainRecord(value)) return undefined;
  const status = isPlainRecord(value.status) ? value.status : undefined;
  if (status && !terminal(status) && !Array.isArray(value.outputs)) return undefined;
  if (status && (status.status_str === 'error' || status.status === 'error' || status.status === 'failed')) throw createComfyUiExecutionError('observe', 'execution-failed');
  const outputs = isPlainRecord(value.outputs) ? value.outputs : {};
  const descriptors: ComfyUiOutputDescriptor[] = [];
  let unsafe = false;
  for (const node of Object.values(outputs)) {
    if (!isPlainRecord(node) || !Array.isArray(node.images)) continue;
    for (const image of node.images) {
      try { descriptors.push(validateComfyUiOutputDescriptor(image)); } catch { unsafe = true; }
    }
  }
  return { descriptors, warnings: unsafe ? [{ code: 'unsafe-output-skipped', messageKey: 'comfyui.warning.unsafe-output-skipped' }] : [] };
}

/** Poll bounded history until known prompt reaches terminal state. */
export async function observeKnownComfyUiPrompt(input: { readonly connection: ComfyUiExecutionConnection; readonly promptId: string }, dependencies: { readonly transport: ComfyUiHttpTransport; readonly hintSource?: ComfyUiPromptHintSource; readonly clock?: ComfyUiExecutionClock }, signal?: AbortSignal): Promise<ComfyUiObservedOutputs> {
  const clock = dependencies.clock ?? defaultComfyUiExecutionClock;
  let hintUnavailable = dependencies.hintSource === undefined;
  if (dependencies.hintSource !== undefined) { try { await dependencies.hintSource.waitForHint(input.promptId, input.connection.observationTimeoutMs, signal); } catch { hintUnavailable = true; } }
  const deadline = clock.now() + input.connection.observationTimeoutMs;
  while (clock.now() <= deadline) {
    if (signal?.aborted) throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
    let response: ComfyUiHttpResponse;
    try { response = await dependencies.transport.request({ origin: input.connection.baseUrl, method: 'GET', path: `/history/${encodeURIComponent(input.promptId)}`, timeoutMs: input.connection.requestTimeoutMs, maxResponseBytes: 2_000_000 }, signal); } catch (error) { throw normalizeComfyUiExecutionError(error, { stage: 'observe', code: 'execution-state-unknown', remoteMayContinue: true }); }
    const body = jsonResponse(response, 2_000_000);
    const entry = isPlainRecord(body) && isPlainRecord(body[input.promptId]) ? body[input.promptId] : body;
    const collected = collectHistory(entry);
    if (collected !== undefined) return { descriptors: collected.descriptors, warnings: [...(hintUnavailable ? [{ code: 'realtime-hint-unavailable' as const, messageKey: 'comfyui.warning.realtime-hint-unavailable' }] : []), ...collected.warnings] };
    await clock.sleep(Math.min(250, Math.max(1, deadline - clock.now())), signal);
  }
  throw createComfyUiExecutionError('observe', 'history-timeout', { remoteMayContinue: true });
}

function contentType(response: ComfyUiHttpResponse): string | undefined { return Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.split(';')[0]?.trim().toLowerCase(); }
function viewPath(descriptor: ComfyUiOutputDescriptor): string { const params = new URLSearchParams({ filename: descriptor.filename, subfolder: descriptor.subfolder, type: descriptor.type }); return `/view?${params.toString()}`; }
/** Download every safe descriptor; one unsafe item never blocks siblings. */
export async function downloadAndStoreComfyUiOutputs(input: { readonly connection: ComfyUiExecutionConnection; readonly descriptors: readonly ComfyUiOutputDescriptor[] }, dependencies: { readonly transport: ComfyUiHttpTransport; readonly sink: ComfyUiAssetSink }, signal?: AbortSignal): Promise<{ readonly outputs: readonly import('@imagen-ps/core-engine').StoredAssetRef[]; readonly warnings: readonly { readonly code: 'unsafe-output-skipped'; readonly messageKey: string }[] }> {
  const outputs: import('@imagen-ps/core-engine').StoredAssetRef[] = [];
  let skipped = false;
  for (const descriptor of input.descriptors) {
    let response: ComfyUiHttpResponse;
    try { response = await dependencies.transport.request({ origin: input.connection.baseUrl, method: 'GET', path: viewPath(descriptor), timeoutMs: input.connection.requestTimeoutMs, maxResponseBytes: 20 * 1024 * 1024 }, signal); } catch (error) { throw normalizeComfyUiExecutionError(error, { stage: 'download', code: 'download-failed' }); }
    const type = contentType(response);
    const bytes = response.body;
    if (response.status < 200 || response.status >= 300 || bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024 || type === undefined || detectComfyUiImageMime(bytes) !== type) {
      skipped = true;
      continue;
    }
    try {
      outputs.push(await dependencies.sink.put(bytes.slice(), { mimeType: type, name: descriptor.filename }, signal));
    } catch (error) {
      if (signal?.aborted) throw error;
      skipped = true;
    }
  }
  return {
    outputs,
    warnings: skipped ? [{ code: 'unsafe-output-skipped', messageKey: 'comfyui.warning.unsafe-output-skipped' }] : [],
  };
}

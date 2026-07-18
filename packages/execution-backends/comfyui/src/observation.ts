import type { StoredAssetRef } from '@imagen-ps/core-engine';
import {
  COMFYUI_MAX_IMAGE_BYTES,
  validateComfyUiDownloadedImage,
} from './assets.js';
import type { ComfyUiWorkflowContract, ComfyUiWorkflowContractEntry } from './contract/index.js';
import { validateCanonicalComfyUiWorkflowContract } from './contract/index.js';
import {
  createComfyUiExecutionError,
  normalizeComfyUiExecutionError,
} from './errors.js';
import type {
  ComfyUiAssetSink,
  ComfyUiExecutionClock,
  ComfyUiExecutionConnection,
  ComfyUiExecutionWarning,
  ComfyUiHttpResponse,
  ComfyUiHttpTransport,
  ComfyUiPromptHintSource,
} from './execution-types.js';
import { validateComfyUiExecutionResult } from './execution-types.js';
import { decodeJsonBytes, hasExactKeys, isPlainRecord, throwIfAborted, utf8ByteLength } from './internal/value.js';

const MAX_HISTORY_RESPONSE_BYTES = 2_000_000;
const MAX_QUEUE_RESPONSE_BYTES = 1_000_000;
const MAX_QUEUE_ENTRIES = 1_000;
const MAX_OUTPUT_DESCRIPTORS = 64;

/** `/history` 中允许进入 `/view` 的 safe descriptor。 */
export interface ComfyUiOutputDescriptor {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: 'input' | 'temp' | 'output';
}

/** Known-prompt reconciliation 的 terminal descriptor result。 */
export interface ComfyUiObservedOutputs {
  readonly descriptors: readonly ComfyUiOutputDescriptor[];
  readonly warnings: readonly ComfyUiExecutionWarning[];
}

/** Default bounded polling clock。 */
export const defaultComfyUiExecutionClock: ComfyUiExecutionClock = {
  now: () => Date.now(),
  sleep(ms, signal) {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('aborted'));
        return;
      }
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error === undefined) resolve();
        else reject(error);
      };
      const onAbort = (): void => {
        finish(new Error('aborted'));
      };
      const timer = setTimeout(() => finish(), ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  },
};

function safePathPart(value: string, allowNested: boolean): boolean {
  if (
    value.length === 0 && !allowNested
    || utf8ByteLength(value) > 512
    || /[\u0000-\u001f\u007f\\]/.test(value)
    || value.includes('%')
    || value.startsWith('/')
    || /^[A-Za-z]:/.test(value)
  ) return false;
  const parts = value.split('/');
  if (!allowNested && parts.length !== 1) return false;
  return parts.every((part) => part !== '.' && part !== '..' && (allowNested || part.length > 0));
}

/** 拒绝 absolute、traversal、control chars 与 unsupported type。 */
export function validateComfyUiOutputDescriptor(value: unknown): ComfyUiOutputDescriptor {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['filename', 'subfolder', 'type'])) {
    throw createComfyUiExecutionError('observe', 'unsafe-output', { remoteMayContinue: false });
  }
  if (
    typeof value.filename !== 'string'
    || !safePathPart(value.filename, false)
    || typeof value.subfolder !== 'string'
    || !safePathPart(value.subfolder, true)
    || (value.type !== 'input' && value.type !== 'temp' && value.type !== 'output')
  ) throw createComfyUiExecutionError('observe', 'unsafe-output');
  return { filename: value.filename, subfolder: value.subfolder, type: value.type };
}

function parseJsonResponse(response: ComfyUiHttpResponse, maxBytes: number): unknown {
  if (response.status < 200 || response.status >= 300 || response.body.byteLength > maxBytes) {
    throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
  }
  try {
    return decodeJsonBytes(response.body);
  } catch {
    throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
  }
}

function failedHistory(entry: Record<string, unknown>): boolean {
  const status = entry.status;
  if (!isPlainRecord(status)) return false;
  if (status.status_str === 'error' || status.status_str === 'failed') return true;
  if (!Array.isArray(status.messages)) return false;
  return status.messages.some((message) => Array.isArray(message)
    && (message[0] === 'execution_error' || message[0] === 'execution_interrupted'));
}

function terminalHistory(entry: Record<string, unknown>): boolean {
  if (isPlainRecord(entry.status) && entry.status.completed === true) return true;
  return isPlainRecord(entry.outputs);
}

function outputEntries(contract: ComfyUiWorkflowContract): readonly ComfyUiWorkflowContractEntry[] {
  return contract.entries.filter((entry) => entry.role === 'output-image').sort((left, right) => left.slot - right.slot);
}

function collectHistoryDescriptors(
  entry: Record<string, unknown>,
  contract: ComfyUiWorkflowContract,
): ComfyUiObservedOutputs | undefined {
  if (failedHistory(entry)) throw createComfyUiExecutionError('observe', 'execution-failed');
  if (!terminalHistory(entry)) return undefined;
  if (!isPlainRecord(entry.outputs)) throw createComfyUiExecutionError('observe', 'execution-state-unknown');
  const descriptors: ComfyUiOutputDescriptor[] = [];
  const warnings: ComfyUiExecutionWarning[] = [];
  for (const output of outputEntries(contract)) {
    const node = entry.outputs[output.locator.nodeId];
    const raw = isPlainRecord(node) ? node[output.locator.fieldName] : undefined;
    if (!Array.isArray(raw) || raw.length === 0) {
      if (output.required) throw createComfyUiExecutionError('observe', 'unsafe-output');
      warnings.push({
        code: 'optional-output-missing',
        messageKey: 'comfyui.warning.optional-output-missing',
      });
      continue;
    }
    for (const descriptor of raw) {
      descriptors.push(validateComfyUiOutputDescriptor(descriptor));
      if (descriptors.length > MAX_OUTPUT_DESCRIPTORS) {
        throw createComfyUiExecutionError('observe', 'unsafe-output');
      }
    }
  }
  if (descriptors.length === 0) throw createComfyUiExecutionError('observe', 'unsafe-output');
  return { descriptors, warnings };
}

function queueContainsPrompt(value: unknown, promptId: string): boolean {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['queue_running', 'queue_pending'])) {
    throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
  }
  const running = value.queue_running;
  const pending = value.queue_pending;
  if (!Array.isArray(running) || !Array.isArray(pending) || running.length + pending.length > MAX_QUEUE_ENTRIES) {
    throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
  }
  return [...running, ...pending].some((item) => Array.isArray(item)
    && item.length >= 2
    && item[1] === promptId);
}

async function requestJson(
  transport: ComfyUiHttpTransport,
  connection: ComfyUiExecutionConnection,
  path: string,
  maxResponseBytes: number,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  let response;
  try {
    response = await transport.request({
      origin: connection.origin,
      method: 'GET',
      path,
      timeoutMs: connection.requestTimeoutMs,
      maxResponseBytes,
    }, signal);
  } catch (error) {
    throw normalizeComfyUiExecutionError(error, {
      stage: 'observe',
      code: 'execution-state-unknown',
      remoteMayContinue: true,
    });
  }
  return parseJsonResponse(response, maxResponseBytes);
}

/** 只围绕 accepted promptId 协调 WS hints 与 bounded history/queue authority。 */
export async function observeKnownComfyUiPrompt(
  input: {
    readonly connection: ComfyUiExecutionConnection;
    readonly promptId: string;
    readonly contract: ComfyUiWorkflowContract;
  },
  dependencies: {
    readonly transport: ComfyUiHttpTransport;
    readonly hintSource?: ComfyUiPromptHintSource;
    readonly clock?: ComfyUiExecutionClock;
  },
  signal?: AbortSignal,
): Promise<ComfyUiObservedOutputs> {
  const contract = validateCanonicalComfyUiWorkflowContract(input.contract);
  if (input.promptId.length === 0 || input.promptId.length > 128 || /[\u0000-\u001f\u007f]/.test(input.promptId)) {
    throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
  }
  const clock = dependencies.clock ?? defaultComfyUiExecutionClock;
  const deadline = clock.now() + input.connection.observationTimeoutMs;
  let hintUnavailable = false;
  while (clock.now() < deadline) {
    throwIfAborted(signal);
    const history = await requestJson(
      dependencies.transport,
      input.connection,
      `/history/${encodeURIComponent(input.promptId)}`,
      MAX_HISTORY_RESPONSE_BYTES,
      signal,
    );
    if (!isPlainRecord(history) || Object.keys(history).length > MAX_QUEUE_ENTRIES) {
      throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
    }
    const known = history[input.promptId];
    if (known !== undefined) {
      if (!isPlainRecord(known)) {
        throw createComfyUiExecutionError('observe', 'execution-state-unknown', { remoteMayContinue: true });
      }
      const collected = collectHistoryDescriptors(known, contract);
      if (collected !== undefined) {
        return {
          descriptors: collected.descriptors,
          warnings: hintUnavailable
            ? [{ code: 'realtime-hint-unavailable', messageKey: 'comfyui.warning.realtime-hint-unavailable' }, ...collected.warnings]
            : collected.warnings,
        };
      }
    }

    const queue = await requestJson(
      dependencies.transport,
      input.connection,
      '/queue',
      MAX_QUEUE_RESPONSE_BYTES,
      signal,
    );
    queueContainsPrompt(queue, input.promptId);
    const remaining = deadline - clock.now();
    if (remaining <= 0) break;
    const waitMs = Math.min(250, remaining);
    if (dependencies.hintSource !== undefined && !hintUnavailable) {
      try {
        await dependencies.hintSource.waitForHint(input.promptId, waitMs, signal);
      } catch {
        hintUnavailable = true;
        await clock.sleep(waitMs, signal);
      }
    } else {
      await clock.sleep(waitMs, signal);
    }
  }
  throw createComfyUiExecutionError('observe', 'history-timeout', { remoteMayContinue: true });
}

function contentType(response: ComfyUiHttpResponse): string | undefined {
  for (const [key, value] of Object.entries(response.headers)) {
    if (key.toLowerCase() === 'content-type') return value;
  }
  return undefined;
}

function viewPath(descriptor: ComfyUiOutputDescriptor): string {
  const query = new URLSearchParams({
    filename: descriptor.filename,
    subfolder: descriptor.subfolder,
    type: descriptor.type,
  });
  return `/view?${query.toString()}`;
}

/** Ordered descriptors 下载、guard 后写入 existing AssetStore sink。 */
export async function downloadAndStoreComfyUiOutputs(
  input: {
    readonly connection: ComfyUiExecutionConnection;
    readonly descriptors: readonly ComfyUiOutputDescriptor[];
  },
  dependencies: {
    readonly transport: ComfyUiHttpTransport;
    readonly sink: ComfyUiAssetSink;
  },
  signal?: AbortSignal,
): Promise<readonly StoredAssetRef[]> {
  const outputs: StoredAssetRef[] = [];
  for (const rawDescriptor of input.descriptors) {
    const descriptor = validateComfyUiOutputDescriptor(rawDescriptor);
    let response;
    try {
      response = await dependencies.transport.request({
        origin: input.connection.origin,
        method: 'GET',
        path: viewPath(descriptor),
        timeoutMs: input.connection.requestTimeoutMs,
        maxResponseBytes: COMFYUI_MAX_IMAGE_BYTES,
      }, signal);
    } catch (error) {
      throw normalizeComfyUiExecutionError(error, { stage: 'download', code: 'download-failed' });
    }
    if (response.status < 200 || response.status >= 300 || response.body.byteLength > COMFYUI_MAX_IMAGE_BYTES) {
      throw createComfyUiExecutionError('download', 'download-failed');
    }
    const validated = validateComfyUiDownloadedImage(response.body, contentType(response));
    let storedRef: StoredAssetRef;
    try {
      storedRef = await dependencies.sink.put(
        validated.bytes,
        { mimeType: validated.mimeType, name: descriptor.filename },
        signal,
      );
    } catch (error) {
      throw normalizeComfyUiExecutionError(error, { stage: 'project', code: 'projection-failed' });
    }
    try {
      validateComfyUiExecutionResult({ outputs: [storedRef], warnings: [] });
    } catch {
      throw createComfyUiExecutionError('project', 'projection-failed');
    }
    outputs.push(storedRef);
  }
  if (outputs.length === 0) throw createComfyUiExecutionError('project', 'projection-failed');
  return outputs;
}

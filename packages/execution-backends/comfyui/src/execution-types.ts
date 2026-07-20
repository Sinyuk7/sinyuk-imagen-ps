import type { StoredAssetRef } from '@imagen-ps/core-engine';
import { admitComfyUiApiGraph } from './graph.js';
import type { BoundedComfyUiApiWorkflow } from './graph.js';
import type { WorkflowInputRef, WorkflowPrimitiveValue } from './form.js';
import { deepFreeze, hasExactKeys, isPlainRecord, utf8ByteLength } from './internal/value.js';

/** 单个 durable ComfyUI image input。*/
export interface ComfyUiExecutionAssetInput {
  readonly storedRef: StoredAssetRef;
  readonly width: number;
  readonly height: number;
}

/** Workflow revision 明确声明的 canonical Mask 路由。 */
export interface ComfyUiMaskBinding {
  readonly transport: 'separate-image-input';
  readonly inputRef: WorkflowInputRef;
  readonly polarity: 'white-edit' | 'black-edit';
}

/** 仅在当前 workflow revision 有有效 binding 时存在的 Mask 输入。 */
export interface ComfyUiExecutionMaskInput {
  readonly asset: ComfyUiExecutionAssetInput;
  readonly binding: ComfyUiMaskBinding;
}

/** Dispatch 使用的 singleton connection snapshot。*/
export interface ComfyUiExecutionConnection {
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  readonly observationTimeoutMs: number;
}

/** Internal source union；format/driver 不进入上层持久化或 UI。*/
export type ComfyUiExecutionSource =
  | { readonly kind: 'api-graph'; readonly workflowId: string; readonly revision: string; readonly graph: BoundedComfyUiApiWorkflow; readonly objectInfo?: Readonly<Record<string, Readonly<Record<string, unknown>>>> }
  | { readonly kind: 'frontend-workflow'; readonly workflowId: string; readonly revision: string; readonly remotePath: string };

/** Native execution request。*/
export interface ComfyUiExecutionRequest {
  readonly connection: ComfyUiExecutionConnection;
  readonly source: ComfyUiExecutionSource;
  readonly prompt?: string;
  readonly images: readonly ComfyUiExecutionAssetInput[];
  readonly mutations?: readonly { readonly ref: WorkflowInputRef; readonly value: WorkflowPrimitiveValue }[];
  readonly imageInputRef?: WorkflowInputRef;
  readonly mask?: ComfyUiExecutionMaskInput;
}

export interface ComfyUiResolvedAsset { readonly bytes: Uint8Array; readonly mimeType: string; readonly name?: string }
export interface ComfyUiAssetResolver { resolve(ref: StoredAssetRef, signal?: AbortSignal): Promise<ComfyUiResolvedAsset | undefined> }
export interface ComfyUiAssetSink { put(bytes: Uint8Array, meta: { readonly mimeType: string; readonly name?: string }, signal?: AbortSignal): Promise<StoredAssetRef> }

export interface ComfyUiHttpRequest {
  readonly origin: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
}
export interface ComfyUiHttpResponse { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: Uint8Array }
export interface ComfyUiHttpTransport { request(request: ComfyUiHttpRequest, signal?: AbortSignal): Promise<ComfyUiHttpResponse> }
export interface ComfyUiPromptHintSource { waitForHint(promptId: string, timeoutMs: number, signal?: AbortSignal): Promise<void>; dispose(): void }
export interface ComfyUiPromptHintSourceFactory { open(input: { readonly origin: string; readonly clientId: string }, signal?: AbortSignal): Promise<ComfyUiPromptHintSource> }

export interface ComfyUiBridgeIdentity { readonly origin: string; readonly sourceId: string; readonly loadId: string }
export interface ComfyUiBridgeCapabilities { readonly nativeQueue: boolean; readonly workflowDiscovery: boolean; readonly receiptObserver: boolean }
export interface ComfyUiBridgeLimits {
  readonly maxMessageBytes: number;
  readonly maxWorkflowPathBytes: number;
  readonly maxWorkflowListEntries: number;
  readonly maxMutations: number;
  readonly maxIdChars: number;
  readonly maxConfigureTimeoutMs: number;
}
export type ComfyUiBridgeCommand = 'handshake' | 'list-workflows' | 'open-workflow' | 'form-values' | 'set-values' | 'submit' | 'reset' | 'dispose';
export interface ComfyUiBridgeRequest { readonly requestId: string; readonly identity: ComfyUiBridgeIdentity; readonly command: ComfyUiBridgeCommand; readonly payload: Readonly<Record<string, unknown>> }
export interface ComfyUiFrontendBridgePort { readonly identity: ComfyUiBridgeIdentity; exchange(request: ComfyUiBridgeRequest, signal?: AbortSignal): Promise<unknown> }
export interface ComfyUiFrontendBridgeResolver { resolve(workflowId: string): Promise<ComfyUiFrontendBridgePort | undefined> }
export interface ComfyUiExecutionClock { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> }

export type ComfyUiExecutionWarningCode = 'realtime-hint-unavailable' | 'unsafe-output-skipped' | 'optional-output-missing';
export interface ComfyUiExecutionWarning { readonly code: ComfyUiExecutionWarningCode; readonly messageKey: string }
export interface ComfyUiExecutionResult { readonly outputs: readonly StoredAssetRef[]; readonly warnings: readonly ComfyUiExecutionWarning[] }

function boundedId(value: unknown, max = 128): value is string {
  return typeof value === 'string' && value.length > 0 && [...value].length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function validateStoredAssetRef(value: unknown): StoredAssetRef {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['kind', 'ref'], ['name', 'mimeType', 'sha256', 'byteSize'])) throw new Error('invalid-stored-ref');
  if (!['inline', 'url', 'hostObject', 'externalToken'].includes(String(value.kind)) || !boundedId(value.ref, 2048)) throw new Error('invalid-stored-ref');
  if (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 256)) throw new Error('invalid-stored-ref');
  if (value.mimeType !== undefined && (typeof value.mimeType !== 'string' || value.mimeType.length > 128)) throw new Error('invalid-stored-ref');
  if (value.sha256 !== undefined && (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256))) throw new Error('invalid-stored-ref');
  if (value.byteSize !== undefined && (!Number.isInteger(value.byteSize) || Number(value.byteSize) < 0)) throw new Error('invalid-stored-ref');
  return deepFreeze({ ...value }) as unknown as StoredAssetRef;
}
function validateAssetInput(value: unknown): ComfyUiExecutionAssetInput {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['storedRef', 'width', 'height']) || !Number.isInteger(value.width) || !Number.isInteger(value.height) || Number(value.width) < 1 || Number(value.height) < 1 || Number(value.width) > 65_535 || Number(value.height) > 65_535) throw new Error('invalid-asset-input');
  return deepFreeze({ storedRef: validateStoredAssetRef(value.storedRef), width: Number(value.width), height: Number(value.height) });
}
function validateConnection(value: unknown): ComfyUiExecutionConnection {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['baseUrl', 'requestTimeoutMs', 'observationTimeoutMs']) || typeof value.baseUrl !== 'string' || value.baseUrl.length > 2_048) throw new Error('invalid-connection');
  let url: URL;
  try { url = new URL(value.baseUrl); } catch { throw new Error('invalid-connection'); }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || /[\u0000-\u001f\u007f]/.test(url.pathname) || !Number.isInteger(value.requestTimeoutMs) || !Number.isInteger(value.observationTimeoutMs) || Number(value.requestTimeoutMs) < 100 || Number(value.requestTimeoutMs) > 300_000 || Number(value.observationTimeoutMs) < 100 || Number(value.observationTimeoutMs) > 300_000) throw new Error('invalid-connection');
  const path = url.pathname.replace(/\/+$/u, '');
  return deepFreeze({ baseUrl: `${url.origin}${path}`, requestTimeoutMs: Number(value.requestTimeoutMs), observationTimeoutMs: Number(value.observationTimeoutMs) });
}
function validateRemotePath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || utf8ByteLength(value) > 512 || value.startsWith('/') || value.includes('\\') || value.includes('%') || /[\u0000-\u001f\u007f]/.test(value) || !value.endsWith('.json') || value.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) throw new Error('invalid-workflow');
  return value;
}
function validateInputRef(value: unknown): WorkflowInputRef {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['nodeId'], ['inputName', 'widgetIndex']) || !boundedId(value.nodeId) || (value.inputName !== undefined && !boundedId(value.inputName)) || (value.widgetIndex !== undefined && (!Number.isInteger(value.widgetIndex) || Number(value.widgetIndex) < 0)) || (value.inputName === undefined && value.widgetIndex === undefined)) throw new Error('invalid-request');
  return deepFreeze({ nodeId: value.nodeId, ...(value.inputName !== undefined ? { inputName: value.inputName } : {}), ...(value.widgetIndex !== undefined ? { widgetIndex: Number(value.widgetIndex) } : {}) });
}
function sameInputRef(left: WorkflowInputRef, right: WorkflowInputRef): boolean {
  return left.nodeId === right.nodeId
    && left.inputName === right.inputName
    && left.widgetIndex === right.widgetIndex;
}
function validateMaskInput(value: unknown): ComfyUiExecutionMaskInput {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['asset', 'binding']) || !isPlainRecord(value.binding) || !hasExactKeys(value.binding, ['transport', 'inputRef', 'polarity']) || value.binding.transport !== 'separate-image-input' || (value.binding.polarity !== 'white-edit' && value.binding.polarity !== 'black-edit')) throw new Error('invalid-mask-input');
  return deepFreeze({
    asset: validateAssetInput(value.asset),
    binding: deepFreeze({
      transport: 'separate-image-input' as const,
      inputRef: validateInputRef(value.binding.inputRef),
      polarity: value.binding.polarity,
    }),
  });
}

/** Adapter boundary 处验证并冻结 request。*/
export function validateComfyUiExecutionRequest(value: unknown): ComfyUiExecutionRequest {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['connection', 'source', 'images'], ['prompt', 'mutations', 'imageInputRef', 'mask'])) throw new Error('invalid-request');
  if (value.prompt !== undefined && (typeof value.prompt !== 'string' || utf8ByteLength(value.prompt) > 65_536)) throw new Error('invalid-request');
  if (!Array.isArray(value.images) || value.images.length > 32) throw new Error('invalid-request');
  if (!isPlainRecord(value.source) || !boundedId(value.source.workflowId) || !boundedId(value.source.revision)) throw new Error('invalid-request');
  let source: ComfyUiExecutionSource;
  if (value.source.kind === 'api-graph' && hasExactKeys(value.source, ['kind', 'workflowId', 'revision', 'graph'], ['objectInfo'])) source = deepFreeze({ kind: 'api-graph', workflowId: value.source.workflowId, revision: value.source.revision, graph: admitComfyUiApiGraph(value.source.graph), ...(value.source.objectInfo !== undefined ? { objectInfo: value.source.objectInfo } : {}) }) as ComfyUiExecutionSource;
  else if (value.source.kind === 'frontend-workflow' && hasExactKeys(value.source, ['kind', 'workflowId', 'revision', 'remotePath'])) source = deepFreeze({ kind: 'frontend-workflow', workflowId: value.source.workflowId, revision: value.source.revision, remotePath: validateRemotePath(value.source.remotePath) });
  else throw new Error('invalid-request');
  let mutations: ComfyUiExecutionRequest['mutations'];
  if (value.mutations !== undefined) {
    if (!Array.isArray(value.mutations) || value.mutations.length > 256) throw new Error('invalid-request');
    mutations = value.mutations.map((item): NonNullable<ComfyUiExecutionRequest['mutations']>[number] => {
      if (!isPlainRecord(item) || !isPlainRecord(item.ref) || !boundedId(item.ref.nodeId) || (item.ref.inputName !== undefined && !boundedId(item.ref.inputName)) || (item.ref.widgetIndex !== undefined && (!Number.isInteger(item.ref.widgetIndex) || Number(item.ref.widgetIndex) < 0)) || (typeof item.value !== 'string' && typeof item.value !== 'number' && typeof item.value !== 'boolean') || (typeof item.value === 'string' && utf8ByteLength(item.value) > 65_536)) throw new Error('invalid-request');
      return deepFreeze({ ref: deepFreeze({ nodeId: item.ref.nodeId, ...(item.ref.inputName !== undefined ? { inputName: item.ref.inputName } : {}), ...(item.ref.widgetIndex !== undefined ? { widgetIndex: Number(item.ref.widgetIndex) } : {}) }), value: item.value });
    });
  }
  const imageInputRef = value.imageInputRef === undefined ? undefined : validateInputRef(value.imageInputRef);
  const mask = value.mask === undefined ? undefined : validateMaskInput(value.mask);
  if (imageInputRef !== undefined && mask !== undefined && sameInputRef(imageInputRef, mask.binding.inputRef)) throw new Error('invalid-mask-input');
  return deepFreeze({ connection: validateConnection(value.connection), source, ...(value.prompt !== undefined ? { prompt: value.prompt } : {}), images: value.images.map(validateAssetInput), ...(mutations !== undefined ? { mutations } : {}), ...(imageInputRef === undefined ? {} : { imageInputRef }), ...(mask === undefined ? {} : { mask }) });
}

/** Result guard；success with zero outputs valid。*/
export function validateComfyUiExecutionResult(value: unknown): ComfyUiExecutionResult {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['outputs', 'warnings']) || !Array.isArray(value.outputs) || value.outputs.length > 64 || !Array.isArray(value.warnings) || value.warnings.length > 32) throw new Error('invalid-result');
  const outputs = value.outputs.map(validateStoredAssetRef);
  const warnings = value.warnings.map((warning): ComfyUiExecutionWarning => {
    if (!isPlainRecord(warning) || !hasExactKeys(warning, ['code', 'messageKey']) || !['realtime-hint-unavailable', 'unsafe-output-skipped', 'optional-output-missing'].includes(String(warning.code)) || warning.messageKey !== `comfyui.warning.${String(warning.code)}`) throw new Error('invalid-result');
    return deepFreeze({ code: warning.code as ComfyUiExecutionWarningCode, messageKey: warning.messageKey as string });
  });
  return deepFreeze({ outputs, warnings });
}

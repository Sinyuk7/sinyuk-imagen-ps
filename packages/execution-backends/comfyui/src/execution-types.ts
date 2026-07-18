import type { StoredAssetRef } from '@imagen-ps/core-engine';
import type { ContractMaskEncoding, ComfyUiWorkflowContract } from './contract/index.js';
import type { BoundedApiWorkflow } from './graph.js';
import { admitComfyUiApiGraph } from './graph.js';
import { validateCanonicalComfyUiWorkflowContract } from './contract/index.js';
import { deepFreeze, hasExactKeys, isPlainRecord, utf8ByteLength } from './internal/value.js';

/** 单个 durable ComfyUI input asset 与 bounded geometry。 */
export interface ComfyUiExecutionAssetInput {
  readonly storedRef: StoredAssetRef;
  readonly width: number;
  readonly height: number;
}

/** Dispatch 使用的 admitted connection snapshot。 */
export interface ComfyUiExecutionConnection {
  readonly connectionId: string;
  readonly origin: string;
  readonly requestTimeoutMs: number;
  readonly observationTimeoutMs: number;
}

/** API Graph 与 Frontend workflow 的唯一 source union。 */
export type ComfyUiExecutionSource =
  | {
      readonly kind: 'api-graph';
      readonly workflowId: string;
      readonly graph: BoundedApiWorkflow;
    }
  | {
      readonly kind: 'frontend-workflow';
      readonly workflowId: string;
      readonly remotePath: string;
    };

/** Adapter 唯一接受的 durable-safe ComfyUI request。 */
export interface ComfyUiExecutionRequest {
  readonly connection: ComfyUiExecutionConnection;
  readonly source: ComfyUiExecutionSource;
  readonly contract: ComfyUiWorkflowContract;
  readonly prompt: string;
  readonly images: readonly ComfyUiExecutionAssetInput[];
  readonly mask?: ComfyUiExecutionAssetInput;
}

/** Asset resolver 返回的 call-stack-only bytes。 */
export interface ComfyUiResolvedAsset {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly name?: string;
}

/** Host-injected StoredAssetRef resolver。 */
export interface ComfyUiAssetResolver {
  resolve(ref: StoredAssetRef, signal?: AbortSignal): Promise<ComfyUiResolvedAsset | undefined>;
}

/** Existing AssetStore 的 narrow output sink。 */
export interface ComfyUiAssetSink {
  put(
    bytes: Uint8Array,
    meta: { readonly mimeType: string; readonly name?: string },
    signal?: AbortSignal,
  ): Promise<StoredAssetRef>;
}

/** Explicit mask encoding 的 host-neutral codec port。 */
export interface ComfyUiMaskEncoder {
  encode(
    asset: ComfyUiResolvedAsset,
    encoding: ContractMaskEncoding,
    geometry: { readonly width: number; readonly height: number },
    signal?: AbortSignal,
  ): Promise<ComfyUiResolvedAsset>;
}

/** Transport-neutral ComfyUI HTTP request。 */
export interface ComfyUiHttpRequest {
  readonly origin: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
}

/** Transport-neutral bounded ComfyUI HTTP response。 */
export interface ComfyUiHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

/** Host-injected HTTP transport；default tests 只用 fake。 */
export interface ComfyUiHttpTransport {
  request(request: ComfyUiHttpRequest, signal?: AbortSignal): Promise<ComfyUiHttpResponse>;
}

/** WebSocket/Bridge hints 的 prompt-scoped narrow port。 */
export interface ComfyUiPromptHintSource {
  waitForHint(promptId: string, timeoutMs: number, signal?: AbortSignal): Promise<void>;
  dispose(): void;
}

/** API driver 建立 ephemeral client channel 的 factory。 */
export interface ComfyUiPromptHintSourceFactory {
  open(
    input: { readonly origin: string; readonly clientId: string },
    signal?: AbortSignal,
  ): Promise<ComfyUiPromptHintSource>;
}

/** Bridge message session identity。 */
export interface ComfyUiBridgeIdentity {
  readonly origin: string;
  readonly sourceId: string;
  readonly loadId: string;
}

/** Bridge handshake 声明的 capabilities。 */
export interface ComfyUiBridgeCapabilities {
  readonly nativeQueue: boolean;
  readonly workflowDiscovery: boolean;
  readonly receiptObserver: boolean;
}

/** Bridge handshake 声明的 fixed limits。 */
export interface ComfyUiBridgeLimits {
  readonly maxMessageBytes: number;
  readonly maxWorkflowPathBytes: number;
  readonly maxWorkflowListEntries: number;
  readonly maxMutations: number;
  readonly maxIdChars: number;
  readonly maxConfigureTimeoutMs: number;
}

/** Fixed Bridge request envelope。 */
export interface ComfyUiBridgeRequest {
  readonly requestId: string;
  readonly identity: ComfyUiBridgeIdentity;
  readonly command: 'handshake' | 'list-workflows' | 'submit-workflow' | 'reset' | 'dispose';
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Host-injected page Bridge exchange port。 */
export interface ComfyUiFrontendBridgePort {
  readonly identity: ComfyUiBridgeIdentity;
  exchange(request: ComfyUiBridgeRequest, signal?: AbortSignal): Promise<unknown>;
}

/** Connection-scoped Bridge session resolver。 */
export interface ComfyUiFrontendBridgeResolver {
  resolve(connectionId: string): Promise<ComfyUiFrontendBridgePort | undefined>;
}

/** Poll、timeout 与 deterministic tests 使用的 clock。 */
export interface ComfyUiExecutionClock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Execution 成功时允许的 bounded warning code。 */
export type ComfyUiExecutionWarningCode = 'realtime-hint-unavailable' | 'optional-output-missing';

/** Execution 成功时的 bounded warning。 */
export interface ComfyUiExecutionWarning {
  readonly code: ComfyUiExecutionWarningCode;
  readonly messageKey: string;
}

/** Adapter 返回给 Core/Application 的 canonical result。 */
export interface ComfyUiExecutionResult {
  readonly outputs: readonly StoredAssetRef[];
  readonly warnings: readonly ComfyUiExecutionWarning[];
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && [...value].length <= 128
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validateStoredAssetRef(value: unknown): StoredAssetRef {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['kind', 'ref'], ['name', 'mimeType', 'sha256', 'byteSize'])) {
    throw new Error('invalid-stored-ref');
  }
  if (
    !['inline', 'url', 'hostObject', 'externalToken'].includes(String(value.kind))
    || typeof value.ref !== 'string'
    || value.ref.length === 0
    || value.ref.length > 2_048
    || /[\u0000-\u001f\u007f]/.test(value.ref)
  ) {
    throw new Error('invalid-stored-ref');
  }
  if (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 256)) throw new Error('invalid-stored-ref');
  if (value.mimeType !== undefined && (typeof value.mimeType !== 'string' || value.mimeType.length > 128)) throw new Error('invalid-stored-ref');
  if (value.sha256 !== undefined && (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256))) throw new Error('invalid-stored-ref');
  if (value.byteSize !== undefined && (!Number.isInteger(value.byteSize) || Number(value.byteSize) < 0)) throw new Error('invalid-stored-ref');
  return deepFreeze({ ...value }) as unknown as StoredAssetRef;
}

function validateAssetInput(value: unknown): ComfyUiExecutionAssetInput {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['storedRef', 'width', 'height'])) throw new Error('invalid-asset-input');
  if (
    !Number.isInteger(value.width)
    || !Number.isInteger(value.height)
    || Number(value.width) <= 0
    || Number(value.height) <= 0
    || Number(value.width) > 65_535
    || Number(value.height) > 65_535
  ) throw new Error('invalid-asset-input');
  return deepFreeze({
    storedRef: validateStoredAssetRef(value.storedRef),
    width: Number(value.width),
    height: Number(value.height),
  });
}

function validateConnection(value: unknown): ComfyUiExecutionConnection {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['connectionId', 'origin', 'requestTimeoutMs', 'observationTimeoutMs'])) {
    throw new Error('invalid-connection');
  }
  if (!boundedId(value.connectionId) || typeof value.origin !== 'string' || value.origin.length > 2_048) {
    throw new Error('invalid-connection');
  }
  let url: URL;
  try {
    url = new URL(value.origin);
  } catch {
    throw new Error('invalid-connection');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username.length > 0
    || url.password.length > 0
    || url.search.length > 0
    || url.hash.length > 0
    || url.pathname !== '/'
  ) throw new Error('invalid-connection');
  for (const key of ['requestTimeoutMs', 'observationTimeoutMs'] as const) {
    if (!Number.isInteger(value[key]) || Number(value[key]) < 100 || Number(value[key]) > 300_000) {
      throw new Error('invalid-connection');
    }
  }
  return deepFreeze({
    connectionId: value.connectionId,
    origin: url.origin,
    requestTimeoutMs: Number(value.requestTimeoutMs),
    observationTimeoutMs: Number(value.observationTimeoutMs),
  });
}

function validateRemotePath(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || utf8ByteLength(value) > 512
    || value.startsWith('/')
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(value)
    || value.includes('%')
    || !value.endsWith('.json')
    || value.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) throw new Error('invalid-remote-path');
  return value;
}

/** Adapter boundary 处验证并冻结 durable-safe execution request。 */
export function validateComfyUiExecutionRequest(value: unknown): ComfyUiExecutionRequest {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['connection', 'source', 'contract', 'prompt', 'images'], ['mask'])) {
    throw new Error('invalid-request');
  }
  if (typeof value.prompt !== 'string' || value.prompt.trim().length === 0 || utf8ByteLength(value.prompt) > 65_536) {
    throw new Error('invalid-request');
  }
  if (!Array.isArray(value.images) || value.images.length > 32) throw new Error('invalid-request');
  if (!isPlainRecord(value.source) || !boundedId(value.source.workflowId)) throw new Error('invalid-request');
  let source: ComfyUiExecutionSource;
  if (value.source.kind === 'api-graph' && hasExactKeys(value.source, ['kind', 'workflowId', 'graph'])) {
    source = deepFreeze({
      kind: 'api-graph' as const,
      workflowId: value.source.workflowId,
      graph: admitComfyUiApiGraph(value.source.graph),
    });
  } else if (value.source.kind === 'frontend-workflow' && hasExactKeys(value.source, ['kind', 'workflowId', 'remotePath'])) {
    source = deepFreeze({
      kind: 'frontend-workflow' as const,
      workflowId: value.source.workflowId,
      remotePath: validateRemotePath(value.source.remotePath),
    });
  } else {
    throw new Error('invalid-request');
  }
  const images = value.images.map(validateAssetInput);
  const mask = value.mask === undefined ? undefined : validateAssetInput(value.mask);
  if (mask !== undefined && images.length > 0 && (mask.width !== images[0].width || mask.height !== images[0].height)) {
    throw new Error('invalid-request');
  }
  return deepFreeze({
    connection: validateConnection(value.connection),
    source,
    contract: validateCanonicalComfyUiWorkflowContract(value.contract),
    prompt: value.prompt,
    images,
    ...(mask !== undefined ? { mask } : {}),
  });
}

/** Application terminal projector 使用的 canonical result guard。 */
export function validateComfyUiExecutionResult(value: unknown): ComfyUiExecutionResult {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['outputs', 'warnings'])) throw new Error('invalid-result');
  if (!Array.isArray(value.outputs) || value.outputs.length === 0 || value.outputs.length > 64) throw new Error('invalid-result');
  if (!Array.isArray(value.warnings) || value.warnings.length > 32) throw new Error('invalid-result');
  const outputs = value.outputs.map(validateStoredAssetRef);
  const warnings = value.warnings.map((warning): ComfyUiExecutionWarning => {
    if (!isPlainRecord(warning) || !hasExactKeys(warning, ['code', 'messageKey'])) throw new Error('invalid-result');
    if (warning.code !== 'realtime-hint-unavailable' && warning.code !== 'optional-output-missing') {
      throw new Error('invalid-result');
    }
    if (warning.messageKey !== `comfyui.warning.${warning.code}`) throw new Error('invalid-result');
    return deepFreeze({ code: warning.code, messageKey: warning.messageKey });
  });
  return deepFreeze({ outputs, warnings });
}

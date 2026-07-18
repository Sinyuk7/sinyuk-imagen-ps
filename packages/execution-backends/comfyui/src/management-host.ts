import {
  COMFYUI_BRIDGE_COMPATIBILITY,
  validateCanonicalComfyUiWorkflowContract,
  type ComfyUiWorkflowContract,
} from './contract/index.js';
import {
  assertComfyUiBridgeIdentity,
  COMFYUI_BRIDGE_LIMITS,
  createComfyUiBridgeHandshakeRequest,
  validateComfyUiBridgeHandshake,
  type ComfyUiBridgeHandshake,
} from './bridge.js';
import {
  createComfyUiExecutionError,
  normalizeComfyUiExecutionError,
} from './errors.js';
import type {
  ComfyUiBridgeIdentity,
  ComfyUiBridgeRequest,
  ComfyUiFrontendBridgePort,
  ComfyUiFrontendBridgeResolver,
  ComfyUiHttpResponse,
  ComfyUiHttpTransport,
} from './execution-types.js';
import {
  decodeJsonBytes,
  deepFreeze,
  hasExactKeys,
  isPlainRecord,
  safeRuntimeId,
  throwIfAborted,
  utf8ByteLength,
} from './internal/value.js';

const COMFYUI_STATUS_PATH = '/imagen-ps/bridge/status';
const COMFYUI_STATUS_MAX_BYTES = 8_192;
const MAX_CONNECTION_ID_CHARS = 128;
const MAX_ORIGIN_CHARS = 2_048;
const MIN_REQUEST_TIMEOUT_MS = 100;
const MAX_REQUEST_TIMEOUT_MS = 300_000;

/** Management host 只需消费的 canonical connection snapshot。 */
export interface ComfyUiManagementHostConnection {
  readonly connectionId: string;
  readonly origin: string;
  readonly requestTimeoutMs: number;
}

/** Connection test 返回的 bounded Bridge capability evidence。 */
export type ComfyUiManagementHostBridgeEvidence =
  | { readonly status: 'unavailable' | 'incompatible' }
  | {
      readonly status: 'compatible';
      readonly protocolVersion: number;
      readonly bridgeVersion: string;
      readonly frontendVersion: string;
      readonly coreVersion: string;
      readonly contractSchemaVersion: number;
      readonly contractSchemaSha256: string;
      readonly nativeQueue: true;
    };

/** Connection test 的 transport-neutral bounded result。 */
export interface ComfyUiManagementHostTestEvidence {
  readonly api: 'ready' | 'unavailable';
  readonly bridge: ComfyUiManagementHostBridgeEvidence;
}

/** Frontend discovery 返回的 canonical path/contract summary。 */
export interface ComfyUiManagementHostWorkflowSummary {
  readonly remotePath: string;
  readonly contract: ComfyUiWorkflowContract;
}

/** Host composition 注入 management transport 的 options。 */
export interface CreateComfyUiManagementHostOptions {
  readonly httpTransport: ComfyUiHttpTransport;
  readonly frontendBridgeResolver?: ComfyUiFrontendBridgeResolver;
}

/** Execution package 暴露给 Application 薄封装的 management host。 */
export interface ComfyUiManagementHost {
  testConnection(
    connection: ComfyUiManagementHostConnection,
    signal?: AbortSignal,
  ): Promise<ComfyUiManagementHostTestEvidence>;
  discoverFrontendWorkflows(
    connection: ComfyUiManagementHostConnection,
    signal?: AbortSignal,
  ): Promise<readonly ComfyUiManagementHostWorkflowSummary[]>;
}

function boundedString(value: unknown, maxChars: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && [...value].length <= maxChars
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validatedConnection(value: ComfyUiManagementHostConnection): ComfyUiManagementHostConnection {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['connectionId', 'origin', 'requestTimeoutMs'])) {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
  if (
    !boundedString(value.connectionId, MAX_CONNECTION_ID_CHARS)
    || !boundedString(value.origin, MAX_ORIGIN_CHARS)
    || !Number.isInteger(value.requestTimeoutMs)
    || value.requestTimeoutMs < MIN_REQUEST_TIMEOUT_MS
    || value.requestTimeoutMs > MAX_REQUEST_TIMEOUT_MS
  ) {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
  let origin: URL;
  try {
    origin = new URL(value.origin);
  } catch {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
  if (
    (origin.protocol !== 'http:' && origin.protocol !== 'https:')
    || origin.origin !== value.origin
    || origin.username.length > 0
    || origin.password.length > 0
    || origin.search.length > 0
    || origin.hash.length > 0
    || origin.pathname !== '/'
  ) {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
  return deepFreeze({ ...value });
}

function headerValue(response: ComfyUiHttpResponse, name: string): string | undefined {
  const expected = name.toLowerCase();
  return Object.entries(response.headers).find(([key]) => key.toLowerCase() === expected)?.[1];
}

function compatibilityMatches(value: Record<string, unknown>): boolean {
  return Object.entries(COMFYUI_BRIDGE_COMPATIBILITY).every(([key, expected]) => value[key] === expected);
}

function statusCapabilitiesMatch(value: unknown): boolean {
  return isPlainRecord(value)
    && hasExactKeys(value, ['nativeQueue', 'workflowDiscovery', 'receiptObserver'])
    && value.nativeQueue === true
    && value.workflowDiscovery === true
    && value.receiptObserver === true;
}

function statusLimitsMatch(value: unknown): boolean {
  if (!isPlainRecord(value) || !hasExactKeys(value, Object.keys(COMFYUI_BRIDGE_LIMITS))) return false;
  return Object.entries(COMFYUI_BRIDGE_LIMITS).every(([key, expected]) => value[key] === expected);
}

function runtimeVersion(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 64 && !/[\u0000-\u001f\u007f]/.test(value));
}

function validateStatusResponse(response: ComfyUiHttpResponse): void {
  const contentType = headerValue(response, 'content-type')?.toLowerCase();
  if (
    response.status !== 200
    || contentType === undefined
    || !contentType.startsWith('application/json')
    || response.body.byteLength === 0
    || response.body.byteLength > COMFYUI_STATUS_MAX_BYTES
  ) {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
  let value: unknown;
  try {
    value = decodeJsonBytes(response.body);
  } catch {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    'ok',
    'identity',
    ...Object.keys(COMFYUI_BRIDGE_COMPATIBILITY),
    'capabilities',
    'limits',
    'detected',
    'compatible',
  ])) {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
  const detected = value.detected;
  if (
    value.ok !== true
    || !boundedString(value.identity, 128)
    || !compatibilityMatches(value)
    || !statusCapabilitiesMatch(value.capabilities)
    || !statusLimitsMatch(value.limits)
    || !isPlainRecord(detected)
    || !hasExactKeys(detected, ['frontendVersion', 'coreVersion'])
    || !runtimeVersion(detected.frontendVersion)
    || !runtimeVersion(detected.coreVersion)
    || typeof value.compatible !== 'boolean'
  ) {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
}

async function probeApi(
  transport: ComfyUiHttpTransport,
  connection: ComfyUiManagementHostConnection,
  signal?: AbortSignal,
): Promise<'ready' | 'unavailable'> {
  try {
    throwIfAborted(signal);
    const response = await transport.request({
      origin: connection.origin,
      method: 'GET',
      path: COMFYUI_STATUS_PATH,
      timeoutMs: connection.requestTimeoutMs,
      maxResponseBytes: COMFYUI_STATUS_MAX_BYTES,
    }, signal);
    throwIfAborted(signal);
    validateStatusResponse(response);
    return 'ready';
  } catch {
    throwIfAborted(signal);
    return 'unavailable';
  }
}

async function exchangeHandshake(
  bridge: ComfyUiFrontendBridgePort,
  signal?: AbortSignal,
): Promise<ComfyUiBridgeHandshake> {
  throwIfAborted(signal);
  const request = createComfyUiBridgeHandshakeRequest(bridge.identity);
  const response = await bridge.exchange(request, signal);
  throwIfAborted(signal);
  const handshake = validateComfyUiBridgeHandshake(response, request.requestId, request.identity);
  assertComfyUiBridgeIdentity(bridge.identity, handshake.identity);
  return handshake;
}

function compatibleBridgeEvidence(handshake: ComfyUiBridgeHandshake): ComfyUiManagementHostBridgeEvidence {
  return deepFreeze({
    status: 'compatible' as const,
    protocolVersion: handshake.protocolVersion,
    bridgeVersion: handshake.bridgeVersion,
    frontendVersion: handshake.frontendVersion,
    coreVersion: handshake.coreVersion,
    contractSchemaVersion: handshake.contractSchemaVersion,
    contractSchemaSha256: handshake.contractSchemaSha256,
    nativeQueue: true as const,
  });
}

async function testBridge(
  resolver: ComfyUiFrontendBridgeResolver | undefined,
  connectionId: string,
  signal?: AbortSignal,
): Promise<ComfyUiManagementHostBridgeEvidence> {
  if (resolver === undefined) return deepFreeze({ status: 'unavailable' as const });
  let bridge: ComfyUiFrontendBridgePort | undefined;
  try {
    throwIfAborted(signal);
    bridge = await resolver.resolve(connectionId);
    throwIfAborted(signal);
  } catch {
    throwIfAborted(signal);
    return deepFreeze({ status: 'incompatible' as const });
  }
  if (bridge === undefined) return deepFreeze({ status: 'unavailable' as const });
  try {
    return compatibleBridgeEvidence(await exchangeHandshake(bridge, signal));
  } catch {
    throwIfAborted(signal);
    return deepFreeze({ status: 'incompatible' as const });
  }
}

function createListRequest(identity: ComfyUiBridgeIdentity): ComfyUiBridgeRequest {
  const request = deepFreeze({
    requestId: safeRuntimeId('bridge-request'),
    identity: deepFreeze({ ...identity }),
    command: 'list-workflows' as const,
    payload: deepFreeze({}),
  });
  if (utf8ByteLength(JSON.stringify(request)) > COMFYUI_BRIDGE_LIMITS.maxMessageBytes) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  return request;
}

function validateRemotePath(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || utf8ByteLength(value) > COMFYUI_BRIDGE_LIMITS.maxWorkflowPathBytes
    || value.startsWith('/')
    || value.includes('\\')
    || value.includes('%')
    || /[\u0000-\u001f\u007f]/.test(value)
    || !value.endsWith('.json')
    || value.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw createComfyUiExecutionError('prepare', 'invalid-workflow');
  }
  return value;
}

function responseBytes(value: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function validateListResponse(
  value: unknown,
  requestId: string,
): readonly ComfyUiManagementHostWorkflowSummary[] {
  if (
    !isPlainRecord(value)
    || responseBytes(value) > COMFYUI_BRIDGE_LIMITS.maxMessageBytes
    || value.requestId !== requestId
    || typeof value.ok !== 'boolean'
  ) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  if (value.ok === false) {
    if (!hasExactKeys(value, ['requestId', 'ok', 'errorCode']) || !boundedString(value.errorCode, COMFYUI_BRIDGE_LIMITS.maxIdChars)) {
      throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
    }
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  if (!hasExactKeys(value, ['requestId', 'ok', 'payload']) || !isPlainRecord(value.payload) || !hasExactKeys(value.payload, ['workflows'])) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  const workflows = value.payload.workflows;
  if (!Array.isArray(workflows) || workflows.length > COMFYUI_BRIDGE_LIMITS.maxWorkflowListEntries) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  const paths = new Set<string>();
  return deepFreeze(workflows.map((item): ComfyUiManagementHostWorkflowSummary => {
    if (!isPlainRecord(item) || !hasExactKeys(item, ['remotePath', 'contractSummary'])) {
      throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
    }
    const remotePath = validateRemotePath(item.remotePath);
    if (paths.has(remotePath)) throw createComfyUiExecutionError('prepare', 'invalid-workflow');
    paths.add(remotePath);
    let contract: ComfyUiWorkflowContract;
    try {
      contract = validateCanonicalComfyUiWorkflowContract(item.contractSummary);
    } catch {
      throw createComfyUiExecutionError('prepare', 'invalid-contract');
    }
    return deepFreeze({ remotePath, contract });
  }));
}

async function requireBridge(
  resolver: ComfyUiFrontendBridgeResolver | undefined,
  connectionId: string,
  signal?: AbortSignal,
): Promise<ComfyUiFrontendBridgePort> {
  if (resolver === undefined) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  throwIfAborted(signal);
  const bridge = await resolver.resolve(connectionId);
  throwIfAborted(signal);
  if (bridge === undefined) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  return bridge;
}

/** 创建 transport-neutral connection tester 与 Frontend discovery owner。 */
export function createComfyUiManagementHost(
  options: CreateComfyUiManagementHostOptions,
): ComfyUiManagementHost {
  return {
    async testConnection(connection, signal) {
      const checked = validatedConnection(connection);
      const api = await probeApi(options.httpTransport, checked, signal);
      const bridge = await testBridge(options.frontendBridgeResolver, checked.connectionId, signal);
      return deepFreeze({ api, bridge });
    },

    async discoverFrontendWorkflows(connection, signal) {
      const checked = validatedConnection(connection);
      try {
        const bridge = await requireBridge(options.frontendBridgeResolver, checked.connectionId, signal);
        const handshake = await exchangeHandshake(bridge, signal);
        assertComfyUiBridgeIdentity(bridge.identity, handshake.identity);
        const request = createListRequest(handshake.identity);
        const response = await bridge.exchange(request, signal);
        throwIfAborted(signal);
        assertComfyUiBridgeIdentity(bridge.identity, handshake.identity);
        return validateListResponse(response, request.requestId);
      } catch (error) {
        throwIfAborted(signal);
        throw normalizeComfyUiExecutionError(error, {
          stage: 'prepare',
          code: 'bridge-incompatible',
        });
      }
    },
  };
}

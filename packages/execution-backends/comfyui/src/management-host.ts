import { createComfyUiExecutionError } from './errors.js';
import { COMFYUI_BRIDGE_LIMITS, createComfyUiBridgeHandshakeRequest, validateComfyUiBridgeHandshake } from './bridge.js';
import {
  createComfyUiConnectionValidationError,
  isComfyUiConnectionValidationError,
  isComfyUiFrontendBridgeResolutionError,
  type ComfyUiConnectionValidationError,
  type ComfyUiConnectionValidationPhase,
  type ComfyUiConnectionValidationReason,
} from './connection-validation.js';
import type {
  ComfyUiExecutionConnection,
  ComfyUiFrontendBridgePort,
  ComfyUiFrontendBridgeResolver,
  ComfyUiHttpResponse,
  ComfyUiHttpTransport,
} from './execution-types.js';
import { decodeJsonBytes, deepFreeze, isPlainRecord, safeRuntimeId, utf8ByteLength } from './internal/value.js';

const SYSTEM_STATS_MAX_BYTES = 65_536;
const SYSTEM_STATS_MAX_VERSION_CHARS = 128;
const SYSTEM_STATS_MAX_DEVICES = 64;

/** Management host 接受的 transport-neutral connection。 */
export interface ComfyUiManagementHostConnection extends ComfyUiExecutionConnection {}

/** 成功 API gate 的 bounded evidence。 */
export interface ComfyUiManagementHostApiEvidence {
  readonly status: 'ready';
  readonly comfyUiVersion: string;
  readonly deviceCount: number;
}

/** 成功 Bridge gate 的 bounded evidence。 */
export interface ComfyUiManagementHostBridgeEvidence {
  readonly status: 'compatible';
  readonly frontendVersion: string;
  readonly coreVersion: string;
}

/** Legacy combined probe 的成功 evidence。 */
export interface ComfyUiManagementHostTestEvidence {
  readonly api: 'ready';
  readonly frontend: 'ready';
  readonly bridge: ComfyUiManagementHostBridgeEvidence;
}

/** Frontend workflow discovery 返回的 bounded summary。 */
export interface ComfyUiManagementHostWorkflowSummary {
  readonly workflowId: string;
  readonly nativeWorkflowId?: string;
  readonly displayName: string;
  readonly remotePath: string;
  readonly revision: string;
}

/** Management host 的 transport 与可选 active resolver dependencies。 */
export interface CreateComfyUiManagementHostOptions {
  readonly httpTransport: ComfyUiHttpTransport;
  readonly frontendBridgeResolver?: ComfyUiFrontendBridgeResolver;
}

/** 可分别执行 API 与 Bridge gate 的 execution management host。 */
export interface ComfyUiManagementHost {
  validateApi(connection: ComfyUiManagementHostConnection, signal?: AbortSignal): Promise<ComfyUiManagementHostApiEvidence>;
  validateBridge(resolver: ComfyUiFrontendBridgeResolver, signal?: AbortSignal): Promise<ComfyUiManagementHostBridgeEvidence>;
  testConnection(connection: ComfyUiManagementHostConnection, signal?: AbortSignal): Promise<ComfyUiManagementHostTestEvidence>;
  discoverFrontendWorkflows(connection: ComfyUiManagementHostConnection, signal?: AbortSignal): Promise<readonly ComfyUiManagementHostWorkflowSummary[]>;
}

function checked(connection: ComfyUiManagementHostConnection): ComfyUiExecutionConnection {
  if (!connection || typeof connection.baseUrl !== 'string') throw createComfyUiExecutionError('prepare', 'invalid-connection');
  return connection;
}

function aborted(phase: ComfyUiConnectionValidationPhase): ComfyUiConnectionValidationError {
  return createComfyUiConnectionValidationError('ABORTED', phase, 'aborted');
}

function throwIfAborted(signal: AbortSignal | undefined, phase: ComfyUiConnectionValidationPhase): void {
  if (signal?.aborted) throw aborted(phase);
}

function boundedVersion(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && utf8ByteLength(value) <= SYSTEM_STATS_MAX_VERSION_CHARS
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validateSystemStatsResponse(response: ComfyUiHttpResponse): ComfyUiManagementHostApiEvidence {
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw createComfyUiConnectionValidationError('API_INVALID_RESPONSE', 'api', 'status-invalid');
  }
  if (!(response.body instanceof Uint8Array) || response.body.byteLength > SYSTEM_STATS_MAX_BYTES) {
    throw createComfyUiConnectionValidationError('API_INVALID_RESPONSE', 'api', 'body-too-large');
  }
  let value: unknown;
  try {
    value = decodeJsonBytes(response.body);
  } catch {
    throw createComfyUiConnectionValidationError('API_INVALID_RESPONSE', 'api', 'json-invalid');
  }
  if (
    !isPlainRecord(value)
    || !isPlainRecord(value.system)
    || !boundedVersion(value.system.comfyui_version)
    || !Array.isArray(value.devices)
    || value.devices.length > SYSTEM_STATS_MAX_DEVICES
    || !value.devices.every(isPlainRecord)
  ) {
    throw createComfyUiConnectionValidationError('API_INVALID_RESPONSE', 'api', 'schema-invalid');
  }
  return deepFreeze({
    status: 'ready' as const,
    comfyUiVersion: value.system.comfyui_version,
    deviceCount: value.devices.length,
  });
}

async function validateApi(
  transport: ComfyUiHttpTransport,
  connection: ComfyUiExecutionConnection,
  signal?: AbortSignal,
): Promise<ComfyUiManagementHostApiEvidence> {
  throwIfAborted(signal, 'api');
  let response: ComfyUiHttpResponse;
  try {
    response = await transport.request({
      origin: connection.baseUrl,
      method: 'GET',
      path: '/system_stats',
      timeoutMs: connection.requestTimeoutMs,
      maxResponseBytes: SYSTEM_STATS_MAX_BYTES,
    }, signal);
  } catch (error) {
    if (signal?.aborted) throw aborted('api');
    if (isComfyUiConnectionValidationError(error)) throw error;
    throw createComfyUiConnectionValidationError('API_UNREACHABLE', 'api', 'request-failed');
  }
  throwIfAborted(signal, 'api');
  return validateSystemStatsResponse(response);
}

function bridgeFailure(
  error: unknown,
  currentPhase: 'bridge-load' | 'bridge-handshake',
  signal?: AbortSignal,
): ComfyUiConnectionValidationError {
  if (signal?.aborted) return aborted(currentPhase);
  if (isComfyUiConnectionValidationError(error)) return error;
  if (isComfyUiFrontendBridgeResolutionError(error)) {
    if (error.reason === 'aborted') return aborted(currentPhase);
    if (error.phase === 'load') {
      return createComfyUiConnectionValidationError('WEBVIEW_LOAD_FAILED', 'bridge-load', error.reason === 'load-failed' ? 'load-failed' : 'unknown');
    }
    if (error.phase === 'ready') {
      return createComfyUiConnectionValidationError('WEBVIEW_LOAD_FAILED', 'bridge-load', error.reason === 'timeout' ? 'ready-timeout' : 'unknown');
    }
    if (error.phase === 'handshake') {
      return createComfyUiConnectionValidationError('BRIDGE_HANDSHAKE_TIMEOUT', 'bridge-handshake', error.reason === 'timeout' ? 'handshake-timeout' : 'unknown');
    }
    const reason: ComfyUiConnectionValidationReason = error.reason === 'identity-mismatch'
      || error.reason === 'protocol-mismatch'
      || error.reason === 'capability-mismatch'
      || error.reason === 'limits-mismatch'
      ? error.reason
      : 'contract-invalid';
    return createComfyUiConnectionValidationError('BRIDGE_CONTRACT_MISMATCH', 'bridge-contract', reason);
  }
  return currentPhase === 'bridge-load'
    ? createComfyUiConnectionValidationError('WEBVIEW_LOAD_FAILED', currentPhase, 'unknown')
    : createComfyUiConnectionValidationError('BRIDGE_HANDSHAKE_TIMEOUT', currentPhase, 'unknown');
}

async function validateBridgeWithPort(
  resolver: ComfyUiFrontendBridgeResolver,
  signal?: AbortSignal,
): Promise<{ readonly bridge: ComfyUiFrontendBridgePort; readonly evidence: ComfyUiManagementHostBridgeEvidence }> {
  throwIfAborted(signal, 'bridge-load');
  let bridge: ComfyUiFrontendBridgePort | undefined;
  try {
    bridge = await resolver.resolve('discovery', signal);
  } catch (error) {
    throw bridgeFailure(error, 'bridge-load', signal);
  }
  throwIfAborted(signal, 'bridge-load');
  if (!bridge) {
    throw createComfyUiConnectionValidationError('WEBVIEW_LOAD_FAILED', 'bridge-load', 'bridge-unavailable');
  }

  const request = createComfyUiBridgeHandshakeRequest(bridge.identity, safeRuntimeId('bridge-request'));
  let response: unknown;
  try {
    response = await bridge.exchange(request, signal);
  } catch (error) {
    throw bridgeFailure(error, 'bridge-handshake', signal);
  }
  throwIfAborted(signal, 'bridge-handshake');
  let handshake;
  try {
    handshake = validateComfyUiBridgeHandshake(response, request.requestId, bridge.identity);
  } catch {
    throw createComfyUiConnectionValidationError('BRIDGE_CONTRACT_MISMATCH', 'bridge-contract', 'contract-invalid');
  }
  return {
    bridge,
    evidence: deepFreeze({
      status: 'compatible' as const,
      frontendVersion: handshake.frontendVersion,
      coreVersion: handshake.coreVersion,
    }),
  };
}

/** 创建 transport-neutral ComfyUI management validation host。 */
export function createComfyUiManagementHost(options: CreateComfyUiManagementHostOptions): ComfyUiManagementHost {
  return {
    validateApi(connection, signal) {
      return validateApi(options.httpTransport, checked(connection), signal);
    },
    async validateBridge(resolver, signal) {
      return (await validateBridgeWithPort(resolver, signal)).evidence;
    },
    async testConnection(connection, signal) {
      await validateApi(options.httpTransport, checked(connection), signal);
      if (!options.frontendBridgeResolver) {
        throw createComfyUiConnectionValidationError('WEBVIEW_LOAD_FAILED', 'bridge-load', 'bridge-unavailable');
      }
      const { evidence } = await validateBridgeWithPort(options.frontendBridgeResolver, signal);
      return deepFreeze({ api: 'ready' as const, frontend: 'ready' as const, bridge: evidence });
    },
    async discoverFrontendWorkflows(connection, signal) {
      checked(connection);
      const resolver = options.frontendBridgeResolver;
      if (!resolver) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
      let bridge: ComfyUiFrontendBridgePort;
      try {
        ({ bridge } = await validateBridgeWithPort(resolver, signal));
      } catch {
        throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
      }
      const request = {
        requestId: safeRuntimeId('bridge-request'),
        identity: bridge.identity,
        command: 'list-workflows' as const,
        payload: {},
      };
      let response: unknown;
      try {
        response = await bridge.exchange(request, signal);
      } catch {
        throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
      }
      if (signal?.aborted) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
      if (
        !isPlainRecord(response)
        || response.ok !== true
        || !isPlainRecord(response.payload)
        || !Array.isArray(response.payload.workflows)
        || response.payload.workflows.length > COMFYUI_BRIDGE_LIMITS.maxWorkflowListEntries
        || utf8ByteLength(JSON.stringify(response)) > COMFYUI_BRIDGE_LIMITS.maxMessageBytes
      ) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
      return deepFreeze(response.payload.workflows.map((item) => {
        if (
          !isPlainRecord(item)
          || typeof item.workflowId !== 'string'
          || typeof item.displayName !== 'string'
          || typeof item.remotePath !== 'string'
          || typeof item.revision !== 'string'
          || (item.nativeWorkflowId !== undefined && (
            typeof item.nativeWorkflowId !== 'string'
            || item.nativeWorkflowId.length === 0
            || Array.from(item.nativeWorkflowId).length > COMFYUI_BRIDGE_LIMITS.maxIdChars
            || /[\u0000-\u001f\u007f]/u.test(item.nativeWorkflowId)
          ))
        ) throw createComfyUiExecutionError('prepare', 'invalid-workflow');
        return {
          workflowId: item.workflowId,
          ...(item.nativeWorkflowId === undefined ? {} : { nativeWorkflowId: item.nativeWorkflowId }),
          displayName: item.displayName,
          remotePath: item.remotePath,
          revision: item.revision,
        };
      }));
    },
  };
}

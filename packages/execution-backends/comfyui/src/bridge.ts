import { COMFYUI_BRIDGE_COMPATIBILITY } from './contract/index.js';
import { createComfyUiExecutionError } from './errors.js';
import type {
  ComfyUiBridgeCapabilities,
  ComfyUiBridgeIdentity,
  ComfyUiBridgeLimits,
  ComfyUiBridgeRequest,
} from './execution-types.js';
import type { ComfyUiWidgetMutation } from './mutation.js';
import { deepFreeze, hasExactKeys, isPlainRecord, safeRuntimeId, utf8ByteLength } from './internal/value.js';

/** Fixed Bridge limits；handshake 必须逐项相等。 */
export const COMFYUI_BRIDGE_LIMITS: ComfyUiBridgeLimits = deepFreeze({
  maxMessageBytes: 2_000_000,
  maxWorkflowPathBytes: 512,
  maxWorkflowListEntries: 1_000,
  maxMutations: 16,
  maxIdChars: 128,
  maxConfigureTimeoutMs: 30_000,
});

/** 验证后的 fixed Bridge handshake payload。 */
export interface ComfyUiBridgeHandshake {
  readonly identity: ComfyUiBridgeIdentity;
  readonly protocolVersion: number;
  readonly bridgeVersion: string;
  readonly frontendVersion: string;
  readonly coreVersion: string;
  readonly contractSchemaVersion: number;
  readonly contractSchemaSha256: string;
  readonly capabilities: ComfyUiBridgeCapabilities;
  readonly limits: ComfyUiBridgeLimits;
}

/** Frontend Queue runtime-only receipt。 */
interface FrontendQueueReceipt {
  readonly operationId: string;
  readonly promptId: string;
  readonly acknowledgedAt: number;
}

const PLUGIN_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;

function boundedId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && [...value].length <= COMFYUI_BRIDGE_LIMITS.maxIdChars
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validateIdentity(value: unknown): ComfyUiBridgeIdentity {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['origin', 'sourceId', 'loadId'])) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  if (typeof value.origin !== 'string' || value.origin.length === 0 || value.origin.length > 2_048 || !boundedId(value.sourceId) || !boundedId(value.loadId)) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  let canonicalHttpOrigin = false;
  try {
    const url = new URL(value.origin);
    canonicalHttpOrigin = (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value.origin;
  } catch {
    canonicalHttpOrigin = false;
  }
  const pluginId = value.origin.length <= 128 && PLUGIN_ID_PATTERN.test(value.origin);
  if (!canonicalHttpOrigin && !pluginId) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  return deepFreeze({ origin: value.origin, sourceId: value.sourceId, loadId: value.loadId });
}

function identitiesMatch(left: ComfyUiBridgeIdentity, right: ComfyUiBridgeIdentity): boolean {
  return left.origin === right.origin && left.sourceId === right.sourceId && left.loadId === right.loadId;
}

function validateCapabilities(value: unknown): ComfyUiBridgeCapabilities {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['nativeQueue', 'workflowDiscovery', 'receiptObserver'])) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  if (value.nativeQueue !== true || value.workflowDiscovery !== true || value.receiptObserver !== true) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  return deepFreeze({ nativeQueue: true, workflowDiscovery: true, receiptObserver: true });
}

function validateLimits(value: unknown): ComfyUiBridgeLimits {
  if (!isPlainRecord(value) || !hasExactKeys(value, Object.keys(COMFYUI_BRIDGE_LIMITS))) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  for (const [key, expected] of Object.entries(COMFYUI_BRIDGE_LIMITS)) {
    if (value[key] !== expected) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  return COMFYUI_BRIDGE_LIMITS;
}

function compatibilityMatches(value: Record<string, unknown>): boolean {
  return Object.entries(COMFYUI_BRIDGE_COMPATIBILITY).every(([key, expected]) => value[key] === expected);
}

function responsePayload(value: unknown, requestId: string, stage: 'prepare' | 'submit'): Record<string, unknown> {
  let serializedBytes = Number.POSITIVE_INFINITY;
  try {
    serializedBytes = utf8ByteLength(JSON.stringify(value));
  } catch {
    // 非纯数据 response 统一映射为 bounded protocol failure。
  }
  if (!isPlainRecord(value) || serializedBytes > COMFYUI_BRIDGE_LIMITS.maxMessageBytes) {
    throw createComfyUiExecutionError(stage, stage === 'prepare' ? 'bridge-incompatible' : 'submission-unknown', {
      remoteMayContinue: stage === 'submit',
    });
  }
  if (value.requestId !== requestId || typeof value.ok !== 'boolean') {
    throw createComfyUiExecutionError(stage, stage === 'prepare' ? 'bridge-incompatible' : 'submission-unknown', {
      remoteMayContinue: stage === 'submit',
    });
  }
  if (value.ok === false) {
    if (!hasExactKeys(value, ['requestId', 'ok', 'errorCode']) || !boundedId(value.errorCode)) {
      throw createComfyUiExecutionError(stage, stage === 'prepare' ? 'bridge-incompatible' : 'submission-unknown', {
        remoteMayContinue: stage === 'submit',
      });
    }
    throw createComfyUiExecutionError(
      stage,
      stage === 'prepare' ? 'bridge-incompatible' : 'submission-rejected',
    );
  }
  if (!hasExactKeys(value, ['requestId', 'ok', 'payload']) || !isPlainRecord(value.payload)) {
    throw createComfyUiExecutionError(stage, stage === 'prepare' ? 'bridge-incompatible' : 'submission-unknown', {
      remoteMayContinue: stage === 'submit',
    });
  }
  return value.payload;
}

/** 构建 exact handshake request；payload 只含 pinned compatibility tuple。 */
export function createComfyUiBridgeHandshakeRequest(
  identity: ComfyUiBridgeIdentity,
  requestId = safeRuntimeId('bridge-request'),
): ComfyUiBridgeRequest {
  const checkedIdentity = validateIdentity(identity);
  if (!boundedId(requestId)) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  return deepFreeze({
    requestId,
    identity: checkedIdentity,
    command: 'handshake' as const,
    payload: { ...COMFYUI_BRIDGE_COMPATIBILITY },
  });
}

/** 验证 handshake response identity、tuple、capabilities 与 exact limits。 */
export function validateComfyUiBridgeHandshake(
  value: unknown,
  requestId: string,
  expectedIdentity: ComfyUiBridgeIdentity,
): ComfyUiBridgeHandshake {
  const payload = responsePayload(value, requestId, 'prepare');
  if (!hasExactKeys(payload, [
    'identity',
    'protocolVersion',
    'bridgeVersion',
    'frontendVersion',
    'coreVersion',
    'contractSchemaVersion',
    'contractSchemaSha256',
    'capabilities',
    'limits',
  ]) || !compatibilityMatches(payload)) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  const identity = validateIdentity(payload.identity);
  if (!identitiesMatch(identity, validateIdentity(expectedIdentity))) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  return deepFreeze({
    identity,
    protocolVersion: Number(payload.protocolVersion),
    bridgeVersion: String(payload.bridgeVersion),
    frontendVersion: String(payload.frontendVersion),
    coreVersion: String(payload.coreVersion),
    contractSchemaVersion: Number(payload.contractSchemaVersion),
    contractSchemaSha256: String(payload.contractSchemaSha256),
    capabilities: validateCapabilities(payload.capabilities),
    limits: validateLimits(payload.limits),
  });
}

function validateRemotePath(remotePath: string): void {
  if (
    utf8ByteLength(remotePath) > COMFYUI_BRIDGE_LIMITS.maxWorkflowPathBytes
    || remotePath.startsWith('/')
    || remotePath.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(remotePath)
    || remotePath.includes('%')
    || !remotePath.endsWith('.json')
    || remotePath.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) throw createComfyUiExecutionError('prepare', 'invalid-workflow');
}

/** 构建只含 contract-derived mutations 的 submit-workflow envelope。 */
export function createComfyUiFrontendSubmitRequest(input: {
  readonly identity: ComfyUiBridgeIdentity;
  readonly remotePath: string;
  readonly mutations: readonly ComfyUiWidgetMutation[];
  readonly configureTimeoutMs: number;
  readonly receiptTimeoutMs: number;
  readonly requestId?: string;
  readonly operationId?: string;
}): { readonly request: ComfyUiBridgeRequest; readonly operationId: string } {
  const requestId = input.requestId ?? safeRuntimeId('bridge-request');
  const operationId = input.operationId ?? safeRuntimeId('comfy-operation');
  if (!boundedId(requestId) || !boundedId(operationId)) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  validateRemotePath(input.remotePath);
  if (
    input.mutations.length === 0
    || input.mutations.length > COMFYUI_BRIDGE_LIMITS.maxMutations
    || !Number.isInteger(input.configureTimeoutMs)
    || input.configureTimeoutMs < 100
    || input.configureTimeoutMs > COMFYUI_BRIDGE_LIMITS.maxConfigureTimeoutMs
    || !Number.isInteger(input.receiptTimeoutMs)
    || input.receiptTimeoutMs < 100
    || input.receiptTimeoutMs > COMFYUI_BRIDGE_LIMITS.maxConfigureTimeoutMs
  ) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  const mutations = input.mutations.map((mutation) => deepFreeze({
    locator: {
      nodeId: mutation.locator.nodeId,
      fieldName: mutation.locator.fieldName,
    },
    value: mutation.value,
  }));
  const locatorKeys = new Set<string>();
  for (const mutation of mutations) {
    if (
      !boundedId(mutation.locator.nodeId)
      || !boundedId(mutation.locator.fieldName)
      || typeof mutation.value !== 'string'
      || mutation.value.length === 0
      || utf8ByteLength(mutation.value) > 65_536
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(mutation.value)
    ) throw createComfyUiExecutionError('prepare', 'invalid-contract');
    const key = `${mutation.locator.nodeId}\u0000${mutation.locator.fieldName}`;
    if (locatorKeys.has(key)) throw createComfyUiExecutionError('prepare', 'invalid-contract');
    locatorKeys.add(key);
  }
  const request = deepFreeze({
    requestId,
    identity: validateIdentity(input.identity),
    command: 'submit-workflow' as const,
    payload: {
      operationId,
      remotePath: input.remotePath,
      batchCount: 1,
      mutations,
      configureTimeoutMs: input.configureTimeoutMs,
      receiptTimeoutMs: input.receiptTimeoutMs,
    },
  });
  if (utf8ByteLength(JSON.stringify(request)) > COMFYUI_BRIDGE_LIMITS.maxMessageBytes) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  return { request, operationId };
}

/** 验证 submit response request/operation identity 与 bounded server receipt。 */
export function validateComfyUiFrontendReceipt(
  value: unknown,
  requestId: string,
  operationId: string,
): FrontendQueueReceipt {
  const payload = responsePayload(value, requestId, 'submit');
  if (!hasExactKeys(payload, ['operationId', 'promptId', 'acknowledgedAt'])) {
    throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
  }
  if (
    payload.operationId !== operationId
    || !boundedId(payload.promptId)
    || typeof payload.acknowledgedAt !== 'number'
    || !Number.isFinite(payload.acknowledgedAt)
    || payload.acknowledgedAt < 0
  ) throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
  return deepFreeze({ operationId, promptId: payload.promptId, acknowledgedAt: payload.acknowledgedAt });
}

/** 比较 Bridge page-load identity，防止旧 operation 投递到新 load。 */
export function assertComfyUiBridgeIdentity(
  actual: ComfyUiBridgeIdentity,
  expected: ComfyUiBridgeIdentity,
  submissionStarted = false,
): void {
  if (!identitiesMatch(validateIdentity(actual), validateIdentity(expected))) {
    throw createComfyUiExecutionError(
      submissionStarted ? 'submit' : 'prepare',
      submissionStarted ? 'submission-unknown' : 'bridge-incompatible',
      { remoteMayContinue: submissionStarted },
    );
  }
}

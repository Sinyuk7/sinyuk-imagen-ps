import { createComfyUiExecutionError, type ComfyUiBridgeErrorCode, type ComfyUiErrorCode } from './errors.js';
import type { ComfyUiBridgeCapabilities, ComfyUiBridgeIdentity, ComfyUiBridgeLimits, ComfyUiBridgeRequest } from './execution-types.js';
import type { ComfyUiWidgetMutation } from './mutation.js';
import { deepFreeze, hasExactKeys, isPlainRecord, safeRuntimeId, utf8ByteLength } from './internal/value.js';

export const COMFYUI_BRIDGE_LIMITS: ComfyUiBridgeLimits = deepFreeze({ maxMessageBytes: 2_000_000, maxWorkflowPathBytes: 512, maxWorkflowListEntries: 1_000, maxMutations: 16, maxIdChars: 128, maxConfigureTimeoutMs: 30_000 });
export const COMFYUI_BRIDGE_COMPATIBILITY = deepFreeze({ protocolVersion: 1, bridgeVersion: '1.0.0', frontendVersion: 'unknown', coreVersion: 'unknown' });
export interface ComfyUiBridgeHandshake { readonly identity: ComfyUiBridgeIdentity; readonly protocolVersion: number; readonly bridgeVersion: string; readonly frontendVersion: string; readonly coreVersion: string; readonly capabilities: ComfyUiBridgeCapabilities; readonly limits: ComfyUiBridgeLimits }
function id(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && [...value].length <= COMFYUI_BRIDGE_LIMITS.maxIdChars && !/[\u0000-\u001f\u007f]/.test(value); }
function identity(value: unknown): ComfyUiBridgeIdentity { if (!isPlainRecord(value) || !hasExactKeys(value, ['origin', 'sourceId', 'loadId']) || typeof value.origin !== 'string' || !id(value.sourceId) || !id(value.loadId)) throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); return deepFreeze({ origin: value.origin, sourceId: value.sourceId, loadId: value.loadId }); }
const BRIDGE_ERROR_CODES: ReadonlySet<string> = new Set(['bridge-incompatible', 'identity-mismatch', 'invalid-request', 'invalid-workflow', 'limit-exceeded', 'submission-rejected', 'submission-unknown', 'unsupported-command']);
function bridgeFailure(stage: 'prepare' | 'submit', bridgeCode: ComfyUiBridgeErrorCode): never {
  const code: ComfyUiErrorCode = bridgeCode === 'invalid-workflow'
    ? 'invalid-workflow'
    : bridgeCode === 'submission-unknown'
      ? 'submission-unknown'
      : bridgeCode === 'bridge-incompatible' || bridgeCode === 'identity-mismatch' || bridgeCode === 'unsupported-command'
        ? 'bridge-incompatible'
        : 'submission-rejected';
  throw createComfyUiExecutionError(stage, stage === 'prepare' && code !== 'invalid-workflow' ? 'bridge-incompatible' : code, {
    remoteMayContinue: stage === 'submit' && bridgeCode === 'submission-unknown',
    bridgeCode,
  });
}
function payload(value: unknown, requestId: string, stage: 'prepare' | 'submit'): Record<string, unknown> {
  if (!isPlainRecord(value) || value.requestId !== requestId || typeof value.ok !== 'boolean' || utf8ByteLength(JSON.stringify(value)) > COMFYUI_BRIDGE_LIMITS.maxMessageBytes) {
    throw createComfyUiExecutionError(stage, stage === 'submit' ? 'submission-unknown' : 'bridge-incompatible', { remoteMayContinue: stage === 'submit' });
  }
  if (value.ok === false) {
    if (typeof value.errorCode !== 'string' || !BRIDGE_ERROR_CODES.has(value.errorCode)) {
      throw createComfyUiExecutionError(stage, stage === 'submit' ? 'submission-unknown' : 'bridge-incompatible', { remoteMayContinue: stage === 'submit' });
    }
    bridgeFailure(stage, value.errorCode as ComfyUiBridgeErrorCode);
  }
  if (!isPlainRecord(value.payload)) throw createComfyUiExecutionError(stage, 'bridge-incompatible');
  return value.payload;
}
export function createComfyUiBridgeHandshakeRequest(expected: ComfyUiBridgeIdentity, requestId = safeRuntimeId('bridge-request')): ComfyUiBridgeRequest { return deepFreeze({ requestId, identity: identity(expected), command: 'handshake', payload: { ...COMFYUI_BRIDGE_COMPATIBILITY } }); }
export function validateComfyUiBridgeHandshake(value: unknown, requestId: string, expected: ComfyUiBridgeIdentity): ComfyUiBridgeHandshake { const p = payload(value, requestId, 'prepare'); if (!hasExactKeys(p, ['identity', 'protocolVersion', 'bridgeVersion', 'frontendVersion', 'coreVersion', 'capabilities', 'limits'])) throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); const actual = identity(p.identity); if (actual.origin !== expected.origin || actual.sourceId !== expected.sourceId || actual.loadId !== expected.loadId || p.protocolVersion !== 1 || !isPlainRecord(p.capabilities) || p.capabilities.nativeQueue !== true || p.capabilities.workflowDiscovery !== true || p.capabilities.receiptObserver !== true || JSON.stringify(p.limits) !== JSON.stringify(COMFYUI_BRIDGE_LIMITS)) throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); return deepFreeze({ identity: actual, protocolVersion: 1, bridgeVersion: String(p.bridgeVersion), frontendVersion: String(p.frontendVersion), coreVersion: String(p.coreVersion), capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true }, limits: COMFYUI_BRIDGE_LIMITS }); }
function remotePath(value: string): void { if (value.length === 0 || utf8ByteLength(value) > 512 || value.startsWith('/') || value.includes('\\') || value.includes('%') || /[\u0000-\u001f\u007f]/.test(value) || !value.endsWith('.json') || value.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) throw createComfyUiExecutionError('prepare', 'invalid-workflow'); }
export function createComfyUiFrontendSubmitRequest(input: { readonly identity: ComfyUiBridgeIdentity; readonly workflowId: string; readonly revision: string; readonly remotePath: string; readonly mutations: readonly ComfyUiWidgetMutation[]; readonly prompt?: string; readonly imageValues?: readonly string[]; readonly configureTimeoutMs: number; readonly receiptTimeoutMs: number; readonly requestId?: string; readonly operationId?: string }): { readonly request: ComfyUiBridgeRequest; readonly operationId: string } { const requestId = input.requestId ?? safeRuntimeId('bridge-request'); const operationId = input.operationId ?? safeRuntimeId('comfy-operation'); if (!id(requestId) || !id(operationId)) throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); remotePath(input.remotePath); if (input.mutations.length > COMFYUI_BRIDGE_LIMITS.maxMutations || input.configureTimeoutMs < 100 || input.receiptTimeoutMs < 100 || input.configureTimeoutMs > COMFYUI_BRIDGE_LIMITS.maxConfigureTimeoutMs || input.receiptTimeoutMs > COMFYUI_BRIDGE_LIMITS.maxConfigureTimeoutMs) throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); const request = deepFreeze({ requestId, identity: identity(input.identity), command: 'submit' as const, payload: { workflowId: input.workflowId, revision: input.revision, remotePath: input.remotePath, operationId, mutations: input.mutations, ...(input.prompt !== undefined ? { prompt: input.prompt } : {}), ...(input.imageValues !== undefined ? { imageValues: input.imageValues } : {}), configureTimeoutMs: input.configureTimeoutMs, receiptTimeoutMs: input.receiptTimeoutMs } }); return { request, operationId }; }
export function validateComfyUiFrontendReceipt(value: unknown, requestId: string, operationId: string): { readonly operationId: string; readonly promptId: string; readonly acknowledgedAt: number } { const p = payload(value, requestId, 'submit'); if (!hasExactKeys(p, ['operationId', 'promptId', 'acknowledgedAt']) || p.operationId !== operationId || !id(p.promptId) || typeof p.acknowledgedAt !== 'number' || !Number.isFinite(p.acknowledgedAt)) throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true }); return deepFreeze({ operationId, promptId: p.promptId, acknowledgedAt: p.acknowledgedAt }); }
export function assertComfyUiBridgeIdentity(actual: ComfyUiBridgeIdentity, expected: ComfyUiBridgeIdentity, submissionStarted = false): void { if (actual.origin !== expected.origin || actual.sourceId !== expected.sourceId || actual.loadId !== expected.loadId) throw createComfyUiExecutionError(submissionStarted ? 'submit' : 'prepare', submissionStarted ? 'submission-unknown' : 'bridge-incompatible', { remoteMayContinue: submissionStarted }); }

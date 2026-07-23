import { createComfyUiExecutionError } from './errors.js';
import { COMFYUI_BRIDGE_LIMITS, createComfyUiBridgeHandshakeRequest, validateComfyUiBridgeHandshake } from './bridge.js';
import type { ComfyUiExecutionConnection, ComfyUiFrontendBridgeResolver, ComfyUiFrontendBridgePort, ComfyUiHttpTransport } from './execution-types.js';
import { deepFreeze, isPlainRecord, safeRuntimeId, utf8ByteLength } from './internal/value.js';

export interface ComfyUiManagementHostConnection extends ComfyUiExecutionConnection {}
export interface ComfyUiManagementHostBridgeEvidence { readonly status: 'compatible' | 'unavailable' | 'incompatible'; readonly frontendVersion?: string; readonly coreVersion?: string }
export interface ComfyUiManagementHostTestEvidence { readonly api: 'ready' | 'unavailable'; readonly frontend: 'ready' | 'unavailable'; readonly bridge: ComfyUiManagementHostBridgeEvidence }
export interface ComfyUiManagementHostWorkflowSummary { readonly workflowId: string; readonly nativeWorkflowId?: string; readonly displayName: string; readonly remotePath: string; readonly revision: string }
export interface CreateComfyUiManagementHostOptions { readonly httpTransport: ComfyUiHttpTransport; readonly frontendBridgeResolver?: ComfyUiFrontendBridgeResolver }
export interface ComfyUiManagementHost { testConnection(connection: ComfyUiManagementHostConnection, signal?: AbortSignal): Promise<ComfyUiManagementHostTestEvidence>; discoverFrontendWorkflows(connection: ComfyUiManagementHostConnection, signal?: AbortSignal): Promise<readonly ComfyUiManagementHostWorkflowSummary[]> }
function checked(connection: ComfyUiManagementHostConnection): ComfyUiExecutionConnection { if (!connection || typeof connection.baseUrl !== 'string') throw createComfyUiExecutionError('prepare', 'invalid-connection'); return connection; }
async function probeApi(transport: ComfyUiHttpTransport, connection: ComfyUiExecutionConnection, signal?: AbortSignal): Promise<'ready' | 'unavailable'> { try { const response = await transport.request({ origin: connection.baseUrl, method: 'GET', path: '/system_stats', timeoutMs: connection.requestTimeoutMs, maxResponseBytes: 65_536 }, signal); return response.status >= 200 && response.status < 300 ? 'ready' : 'unavailable'; } catch { return 'unavailable'; } }
function bridgeFor(resolver: ComfyUiFrontendBridgeResolver | undefined, workflowId: string): Promise<ComfyUiFrontendBridgePort | undefined> { return resolver?.resolve(workflowId) ?? Promise.resolve(undefined); }
export function createComfyUiManagementHost(options: CreateComfyUiManagementHostOptions): ComfyUiManagementHost {
  return {
    async testConnection(connection, signal) {
      const value = checked(connection); const api = await probeApi(options.httpTransport, value, signal); let bridge: ComfyUiManagementHostBridgeEvidence = { status: 'unavailable' }; let frontend: 'ready' | 'unavailable' = 'unavailable';
      const candidate = await bridgeFor(options.frontendBridgeResolver, 'discovery');
      if (candidate) { try { const req = createComfyUiBridgeHandshakeRequest(candidate.identity, safeRuntimeId('bridge-request')); const handshake = validateComfyUiBridgeHandshake(await candidate.exchange(req, signal), req.requestId, candidate.identity); bridge = { status: 'compatible', frontendVersion: handshake.frontendVersion, coreVersion: handshake.coreVersion }; frontend = 'ready'; } catch { bridge = { status: 'incompatible' }; } }
      return deepFreeze({ api, frontend, bridge });
    },
    async discoverFrontendWorkflows(connection, signal) {
      checked(connection); const bridge = await bridgeFor(options.frontendBridgeResolver, 'discovery'); if (!bridge) throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
      try {
        const handshake = createComfyUiBridgeHandshakeRequest(bridge.identity, safeRuntimeId('bridge-request'));
        validateComfyUiBridgeHandshake(await bridge.exchange(handshake, signal), handshake.requestId, bridge.identity);
      } catch { throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); }
      const req = { requestId: safeRuntimeId('bridge-request'), identity: bridge.identity, command: 'list-workflows' as const, payload: {} }; let response: unknown; try { response = await bridge.exchange(req, signal); } catch { throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); } if (!isPlainRecord(response) || response.ok !== true || !isPlainRecord(response.payload) || !Array.isArray(response.payload.workflows) || response.payload.workflows.length > COMFYUI_BRIDGE_LIMITS.maxWorkflowListEntries || utf8ByteLength(JSON.stringify(response)) > COMFYUI_BRIDGE_LIMITS.maxMessageBytes) throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); return deepFreeze(response.payload.workflows.map((item) => { if (!isPlainRecord(item) || typeof item.workflowId !== 'string' || typeof item.displayName !== 'string' || typeof item.remotePath !== 'string' || typeof item.revision !== 'string' || (item.nativeWorkflowId !== undefined && (typeof item.nativeWorkflowId !== 'string' || item.nativeWorkflowId.length === 0 || Array.from(item.nativeWorkflowId).length > COMFYUI_BRIDGE_LIMITS.maxIdChars || /[\u0000-\u001f\u007f]/u.test(item.nativeWorkflowId)))) throw createComfyUiExecutionError('prepare', 'invalid-workflow'); return { workflowId: item.workflowId, ...(item.nativeWorkflowId === undefined ? {} : { nativeWorkflowId: item.nativeWorkflowId }), displayName: item.displayName, remotePath: item.remotePath, revision: item.revision }; }));
    },
  };
}

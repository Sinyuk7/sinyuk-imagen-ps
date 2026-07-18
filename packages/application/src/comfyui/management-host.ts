import {
  createComfyUiManagementHost as createExecutionComfyUiManagementHost,
  type ComfyUiManagementHostBridgeEvidence,
  type ComfyUiManagementHostConnection,
  type CreateComfyUiManagementHostOptions,
} from '@imagen-ps/execution-backend-comfyui';
import type {
  ComfyUiBridgeEvidence,
  ComfyUiConnection,
  ComfyUiConnectionTester,
  ComfyUiWorkflowDiscoveryPort,
} from './types.js';

/** Application 薄封装额外注入的 clock。 */
export interface CreateComfyUiManagementHostPortsOptions extends CreateComfyUiManagementHostOptions {
  readonly now?: () => Date;
}

/** Host composition 可直接注入 management service 的两个 ports。 */
export interface ComfyUiManagementHostPorts {
  readonly tester: ComfyUiConnectionTester;
  readonly discovery: ComfyUiWorkflowDiscoveryPort;
}

function hostConnection(connection: ComfyUiConnection): ComfyUiManagementHostConnection {
  return {
    connectionId: connection.connectionId,
    origin: connection.origin,
    requestTimeoutMs: connection.requestTimeoutMs,
  };
}

function applicationBridgeEvidence(
  evidence: ComfyUiManagementHostBridgeEvidence,
): ComfyUiBridgeEvidence {
  if (evidence.status !== 'compatible') return { status: evidence.status };
  return {
    status: 'compatible',
    protocolVersion: evidence.protocolVersion,
    bridgeVersion: evidence.bridgeVersion,
    frontendVersion: evidence.frontendVersion,
    coreVersion: evidence.coreVersion,
    contractSchemaVersion: evidence.contractSchemaVersion,
    contractSchemaDigest: evidence.contractSchemaSha256,
    nativeQueue: evidence.nativeQueue,
  };
}

function checkedAt(now: () => Date): string {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('ComfyUI management clock returned an invalid date.');
  }
  return value.toISOString();
}

/**
 * 将 execution package 的 transport owner 映射为 Application management ports。
 * Application 不解释 raw HTTP path、Bridge envelope 或 workflow summary。
 */
export function createComfyUiManagementHostPorts(
  options: CreateComfyUiManagementHostPortsOptions,
): ComfyUiManagementHostPorts {
  const now = options.now ?? (() => new Date());
  const host = createExecutionComfyUiManagementHost({
    httpTransport: options.httpTransport,
    ...(options.frontendBridgeResolver === undefined
      ? {}
      : { frontendBridgeResolver: options.frontendBridgeResolver }),
  });
  return {
    tester: {
      async test(connection, signal) {
        const evidence = await host.testConnection(hostConnection(connection), signal);
        return {
          checkedAt: checkedAt(now),
          api: evidence.api,
          bridge: applicationBridgeEvidence(evidence.bridge),
        };
      },
    },
    discovery: {
      async list(connection, signal) {
        const workflows = await host.discoverFrontendWorkflows(hostConnection(connection), signal);
        return workflows.map((workflow) => ({
          displayName: workflow.remotePath,
          remotePath: workflow.remotePath,
          contract: workflow.contract,
        }));
      },
    },
  };
}

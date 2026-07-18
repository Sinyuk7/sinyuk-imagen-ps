import {
  admitComfyUiApiGraph,
  COMFYUI_BRIDGE_COMPATIBILITY,
  parseComfyUiWorkflowContractFromApiGraph,
  validateCanonicalComfyUiWorkflowContract,
  validateComfyUiApiGraphTargets,
  type ComfyUiWorkflowContract,
} from '@imagen-ps/execution-backend-comfyui';
import {
  createImmutableSnapshot,
  createValidationError,
} from '@imagen-ps/core-engine';
import type {
  ComfyUiConnection,
  ComfyUiConnectionDraft,
  ComfyUiConnectionTestEvidence,
  ComfyUiDiscoveredWorkflow,
  ComfyUiManagementDependencies,
  ComfyUiWorkflowConfig,
  ComfyUiWorkflowReadiness,
  GenerationTargetSelection,
} from './types.js';
import { hasComfyUiMaskEntry } from './workflow-policy.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_CONFIGURE_TIMEOUT_MS = 30_000;
const DEFAULT_OBSERVATION_TIMEOUT_MS = 300_000;
const MIN_TIMEOUT_MS = 250;
const MAX_REQUEST_TIMEOUT_MS = 120_000;
const MAX_CONFIGURE_TIMEOUT_MS = 30_000;
const MAX_OBSERVATION_TIMEOUT_MS = 300_000;
const MAX_DISCOVERY_ENTRIES = 1_000;
const MAX_REMOTE_PATH_LENGTH = 512;
const MAX_API_GRAPH_BYTES = 2_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      throw createValidationError(`${path} contains unsupported field.`, { path: `${path}.${key}` });
    }
  }
}

function nonEmptyString(value: unknown, path: string, max = 128): string {
  if (typeof value !== 'string') {
    throw createValidationError(`${path} must be a string.`, { path });
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw createValidationError(`${path} is invalid.`, { path });
  }
  return normalized;
}

function boundedTimeout(value: unknown, fallback: number, max: number, path: string): number {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || (normalized as number) < MIN_TIMEOUT_MS || (normalized as number) > max) {
    throw createValidationError(`${path} is outside the supported range.`, { path });
  }
  return normalized as number;
}

function canonicalOrigin(value: unknown): string {
  const raw = nonEmptyString(value, 'ComfyUiConnection.origin', 2_048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw createValidationError('ComfyUiConnection.origin must be a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createValidationError('ComfyUiConnection.origin must use HTTP(S).');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw createValidationError('ComfyUiConnection.origin contains unsupported credentials or URL fields.');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw createValidationError('ComfyUiConnection.origin must not include a path.');
  }
  return parsed.origin;
}

/** 规范化 unauthenticated ComfyUI connection record。 */
export function normalizeComfyUiConnectionDraft(value: ComfyUiConnectionDraft): ComfyUiConnection {
  if (!isRecord(value)) {
    throw createValidationError('ComfyUiConnectionDraft must be a record.');
  }
  assertAllowedKeys(
    value,
    ['connectionId', 'displayName', 'origin', 'requestTimeoutMs', 'configureTimeoutMs', 'observationTimeoutMs'],
    'ComfyUiConnectionDraft',
  );
  return createImmutableSnapshot({
    connectionId: nonEmptyString(value.connectionId, 'ComfyUiConnection.connectionId'),
    displayName: nonEmptyString(value.displayName, 'ComfyUiConnection.displayName', 256),
    origin: canonicalOrigin(value.origin),
    requestTimeoutMs: boundedTimeout(
      value.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      MAX_REQUEST_TIMEOUT_MS,
      'ComfyUiConnection.requestTimeoutMs',
    ),
    configureTimeoutMs: boundedTimeout(
      value.configureTimeoutMs,
      DEFAULT_CONFIGURE_TIMEOUT_MS,
      MAX_CONFIGURE_TIMEOUT_MS,
      'ComfyUiConnection.configureTimeoutMs',
    ),
    observationTimeoutMs: boundedTimeout(
      value.observationTimeoutMs,
      DEFAULT_OBSERVATION_TIMEOUT_MS,
      MAX_OBSERVATION_TIMEOUT_MS,
      'ComfyUiConnection.observationTimeoutMs',
    ),
  }) as ComfyUiConnection;
}

/** 规范化 Frontend remote workflow path。 */
export function normalizeComfyUiRemotePath(value: string): string {
  const path = nonEmptyString(value, 'ComfyUiWorkflow.remotePath', MAX_REMOTE_PATH_LENGTH);
  if (
    new TextEncoder().encode(path).byteLength > MAX_REMOTE_PATH_LENGTH
    || path.startsWith('/')
    || path.includes('\\')
    || path.includes('%')
    || !path.endsWith('.json')
    || path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw createValidationError('ComfyUiWorkflow.remotePath is unsafe.');
  }
  return path;
}

function normalizedWorkflowIdentity(input: {
  readonly workflowId: string;
  readonly displayName: string;
  readonly connectionId: string;
}): Pick<ComfyUiWorkflowConfig, 'workflowId' | 'displayName' | 'connectionId'> {
  return {
    workflowId: nonEmptyString(input.workflowId, 'ComfyUiWorkflow.workflowId'),
    displayName: nonEmptyString(input.displayName, 'ComfyUiWorkflow.displayName', 256),
    connectionId: nonEmptyString(input.connectionId, 'ComfyUiWorkflow.connectionId'),
  };
}

function normalizeBridgeEvidence(value: unknown) {
  if (!isRecord(value)) {
    throw createValidationError('ComfyUI Bridge evidence must be a record.');
  }
  assertAllowedKeys(value, [
    'status',
    'protocolVersion',
    'bridgeVersion',
    'frontendVersion',
    'coreVersion',
    'contractSchemaVersion',
    'contractSchemaDigest',
    'nativeQueue',
  ], 'ComfyUiBridgeEvidence');
  if (!['compatible', 'incompatible', 'unavailable'].includes(String(value.status))) {
    throw createValidationError('ComfyUiBridgeEvidence.status is invalid.');
  }
  if (value.protocolVersion !== undefined && (!Number.isInteger(value.protocolVersion) || Number(value.protocolVersion) < 1)) {
    throw createValidationError('ComfyUiBridgeEvidence.protocolVersion is invalid.');
  }
  for (const key of ['bridgeVersion', 'frontendVersion', 'coreVersion'] as const) {
    if (value[key] !== undefined) nonEmptyString(value[key], `ComfyUiBridgeEvidence.${key}`, 64);
  }
  if (
    value.contractSchemaVersion !== undefined
    && (!Number.isInteger(value.contractSchemaVersion) || Number(value.contractSchemaVersion) < 1)
  ) {
    throw createValidationError('ComfyUiBridgeEvidence.contractSchemaVersion is invalid.');
  }
  if (
    value.contractSchemaDigest !== undefined
    && (typeof value.contractSchemaDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(value.contractSchemaDigest))
  ) {
    throw createValidationError('ComfyUiBridgeEvidence.contractSchemaDigest is invalid.');
  }
  if (value.nativeQueue !== undefined && typeof value.nativeQueue !== 'boolean') {
    throw createValidationError('ComfyUiBridgeEvidence.nativeQueue is invalid.');
  }
  return createImmutableSnapshot(value);
}

function normalizeConnectionTestEvidence(value: unknown): ComfyUiConnectionTestEvidence {
  if (!isRecord(value)) {
    throw createValidationError('ComfyUI connection test evidence must be a record.');
  }
  assertAllowedKeys(value, ['checkedAt', 'api', 'bridge'], 'ComfyUiConnectionTestEvidence');
  const checkedAt = nonEmptyString(value.checkedAt, 'ComfyUiConnectionTestEvidence.checkedAt', 64);
  if (value.api !== 'ready' && value.api !== 'unavailable') {
    throw createValidationError('ComfyUiConnectionTestEvidence.api is invalid.');
  }
  return createImmutableSnapshot({
    checkedAt,
    api: value.api,
    ...(value.bridge === undefined ? {} : { bridge: normalizeBridgeEvidence(value.bridge) }),
  }) as ComfyUiConnectionTestEvidence;
}

function ensureContract(value: ComfyUiWorkflowContract): ComfyUiWorkflowContract {
  return validateCanonicalComfyUiWorkflowContract(value);
}

async function requireConnection(
  dependencies: ComfyUiManagementDependencies,
  connectionId: string,
): Promise<ComfyUiConnection> {
  const connection = await dependencies.connections.get(connectionId);
  if (!connection) {
    throw createValidationError('ComfyUI connection was not found.', { connectionId });
  }
  return connection;
}

async function clearSelectedWorkflow(
  dependencies: ComfyUiManagementDependencies,
  workflowIds: ReadonlySet<string>,
): Promise<void> {
  const selection = await dependencies.selection.get();
  if (selection?.kind === 'comfyui' && workflowIds.has(selection.workflowId)) {
    await dependencies.selection.clear();
  }
}

async function workflowReadiness(
  dependencies: ComfyUiManagementDependencies,
  workflow: ComfyUiWorkflowConfig | undefined,
): Promise<ComfyUiWorkflowReadiness> {
  if (workflow === undefined) return { status: 'not-ready', reason: 'workflow' };
  const connection = await dependencies.connections.get(workflow.connectionId);
  if (connection === undefined) return { status: 'not-ready', reason: 'connection' };
  try {
    const contract = validateCanonicalComfyUiWorkflowContract(workflow.contract);
    if (hasComfyUiMaskEntry(contract)) {
      return { status: 'not-ready', reason: 'workflow' };
    }
    if (workflow.source.kind === 'api-graph') {
      validateComfyUiApiGraphTargets(workflow.source.graph, contract);
    } else {
      normalizeComfyUiRemotePath(workflow.source.remotePath);
    }
  } catch {
    return { status: 'not-ready', reason: 'workflow' };
  }
  if (connection.lastTest?.api !== 'ready') return { status: 'not-ready', reason: 'api' };
  if (workflow.source.kind === 'api-graph') return { status: 'ready' };
  const bridge = connection.lastTest.bridge;
  const compatible = bridge?.status === 'compatible'
    && bridge.nativeQueue === true
    && bridge.protocolVersion === COMFYUI_BRIDGE_COMPATIBILITY.protocolVersion
    && bridge.bridgeVersion === COMFYUI_BRIDGE_COMPATIBILITY.bridgeVersion
    && bridge.frontendVersion === COMFYUI_BRIDGE_COMPATIBILITY.frontendVersion
    && bridge.coreVersion === COMFYUI_BRIDGE_COMPATIBILITY.coreVersion
    && bridge.contractSchemaVersion === COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaVersion
    && bridge.contractSchemaDigest === COMFYUI_BRIDGE_COMPATIBILITY.contractSchemaSha256;
  return compatible ? { status: 'ready' } : { status: 'not-ready', reason: 'bridge' };
}

/** 创建 Application-owned ComfyUI 管理 service。 */
export function createComfyUiManagementService(dependencies: ComfyUiManagementDependencies) {
  const importApiGraph = async (input: {
    readonly workflowId: string;
    readonly displayName: string;
    readonly connectionId: string;
    readonly graph: unknown;
  }): Promise<ComfyUiWorkflowConfig> => {
    const identity = normalizedWorkflowIdentity(input);
    await requireConnection(dependencies, identity.connectionId);
    const graph = admitComfyUiApiGraph(input.graph);
    const contract = parseComfyUiWorkflowContractFromApiGraph(graph);
    validateComfyUiApiGraphTargets(graph, contract);
    const workflow = createImmutableSnapshot({
      ...identity,
      source: { kind: 'api-graph', graph },
      contract,
    }) as ComfyUiWorkflowConfig;
    await dependencies.workflows.save(workflow);
    return workflow;
  };

  const service = {
    async listConnections(): Promise<readonly ComfyUiConnection[]> {
      return dependencies.connections.list();
    },

    async getConnection(connectionId: string): Promise<ComfyUiConnection | undefined> {
      return dependencies.connections.get(nonEmptyString(connectionId, 'connectionId'));
    },

    async saveConnection(draft: ComfyUiConnectionDraft): Promise<ComfyUiConnection> {
      const previous = await dependencies.connections.get(draft.connectionId);
      const normalized = normalizeComfyUiConnectionDraft(draft);
      const sameRuntimeConfig = previous !== undefined
        && previous.origin === normalized.origin
        && previous.requestTimeoutMs === normalized.requestTimeoutMs
        && previous.configureTimeoutMs === normalized.configureTimeoutMs
        && previous.observationTimeoutMs === normalized.observationTimeoutMs;
      const record = !sameRuntimeConfig || previous?.lastTest === undefined
        ? normalized
        : { ...normalized, lastTest: previous.lastTest };
      await dependencies.connections.save(record);
      return createImmutableSnapshot(record) as ComfyUiConnection;
    },

    async deleteConnection(connectionId: string): Promise<void> {
      const id = nonEmptyString(connectionId, 'connectionId');
      const workflows = await dependencies.workflows.list(id);
      await clearSelectedWorkflow(dependencies, new Set(workflows.map((workflow) => workflow.workflowId)));
      await dependencies.workflows.deleteConnection(id);
      await dependencies.connections.delete(id);
    },

    async testConnection(connectionId: string, signal?: AbortSignal): Promise<ComfyUiConnectionTestEvidence> {
      const connection = await requireConnection(dependencies, nonEmptyString(connectionId, 'connectionId'));
      const evidence = normalizeConnectionTestEvidence(await dependencies.tester.test(connection, signal));
      const tested = createImmutableSnapshot({ ...connection, lastTest: evidence }) as ComfyUiConnection;
      await dependencies.connections.save(tested);
      return tested.lastTest!;
    },

    async listWorkflows(connectionId?: string): Promise<readonly ComfyUiWorkflowConfig[]> {
      return dependencies.workflows.list(connectionId);
    },

    async getWorkflow(workflowId: string): Promise<ComfyUiWorkflowConfig | undefined> {
      return dependencies.workflows.get(nonEmptyString(workflowId, 'workflowId'));
    },

    importApiGraph,

    async importApiGraphJson(input: {
      readonly workflowId: string;
      readonly displayName: string;
      readonly connectionId: string;
      readonly json: string;
    }): Promise<ComfyUiWorkflowConfig> {
      if (typeof input.json !== 'string' || new TextEncoder().encode(input.json).byteLength > MAX_API_GRAPH_BYTES) {
        throw createValidationError('ComfyUI API graph JSON exceeds the byte limit.');
      }
      let graph: unknown;
      try {
        graph = JSON.parse(input.json);
      } catch {
        throw createValidationError('ComfyUI API graph JSON is malformed.');
      }
      return importApiGraph({ ...input, graph });
    },

    async saveFrontendWorkflow(input: {
      readonly workflowId: string;
      readonly displayName: string;
      readonly connectionId: string;
      readonly remotePath: string;
      readonly contract: ComfyUiWorkflowContract;
    }): Promise<ComfyUiWorkflowConfig> {
      const identity = normalizedWorkflowIdentity(input);
      await requireConnection(dependencies, identity.connectionId);
      const workflow = createImmutableSnapshot({
        ...identity,
        source: { kind: 'frontend-workflow', remotePath: normalizeComfyUiRemotePath(input.remotePath) },
        contract: ensureContract(input.contract),
      }) as ComfyUiWorkflowConfig;
      await dependencies.workflows.save(workflow);
      return workflow;
    },

    async discoverFrontendWorkflows(
      connectionId: string,
      signal?: AbortSignal,
    ): Promise<readonly ComfyUiDiscoveredWorkflow[]> {
      const connection = await requireConnection(dependencies, nonEmptyString(connectionId, 'connectionId'));
      const discovered = await dependencies.discovery.list(connection, signal);
      if (discovered.length > MAX_DISCOVERY_ENTRIES) {
        throw createValidationError('ComfyUI workflow discovery exceeded the entry limit.');
      }
      return createImmutableSnapshot(discovered.map((item) => ({
        displayName: nonEmptyString(item.displayName, 'discovery.displayName', 256),
        remotePath: normalizeComfyUiRemotePath(item.remotePath),
        contract: ensureContract(item.contract),
      }))) as readonly ComfyUiDiscoveredWorkflow[];
    },

    async deleteWorkflow(workflowId: string): Promise<void> {
      const id = nonEmptyString(workflowId, 'workflowId');
      await clearSelectedWorkflow(dependencies, new Set([id]));
      await dependencies.workflows.delete(id);
    },

    async getWorkflowReadiness(workflowId: string): Promise<ComfyUiWorkflowReadiness> {
      const id = nonEmptyString(workflowId, 'workflowId');
      return workflowReadiness(dependencies, await dependencies.workflows.get(id));
    },

    async setSelection(selection: GenerationTargetSelection): Promise<void> {
      if (!isRecord(selection)) {
        throw createValidationError('GenerationTargetSelection must be a record.');
      }
      if (selection.kind === 'provider') {
        assertAllowedKeys(selection, ['kind', 'profileId', 'modelId'], 'GenerationTargetSelection');
        const profileId = nonEmptyString(selection.profileId, 'GenerationTargetSelection.profileId');
        const normalized = selection.modelId === undefined
          ? { kind: 'provider' as const, profileId }
          : {
              kind: 'provider' as const,
              profileId,
              modelId: nonEmptyString(selection.modelId, 'GenerationTargetSelection.modelId'),
            };
        await dependencies.selection.save(createImmutableSnapshot(normalized));
        return;
      } else if (selection.kind === 'comfyui') {
        assertAllowedKeys(selection, ['kind', 'workflowId'], 'GenerationTargetSelection');
        const workflowId = nonEmptyString(selection.workflowId, 'GenerationTargetSelection.workflowId');
        const workflow = await dependencies.workflows.get(workflowId);
        if (workflow === undefined) {
          throw createValidationError('Selected ComfyUI workflow was not found.', { workflowId });
        }
        if ((await workflowReadiness(dependencies, workflow)).status !== 'ready') {
          await dependencies.selection.clear();
          throw createValidationError('Selected ComfyUI workflow is not ready.', { workflowId });
        }
        await dependencies.selection.save(createImmutableSnapshot({ kind: 'comfyui', workflowId }));
        return;
      } else {
        throw createValidationError('GenerationTargetSelection.kind is invalid.');
      }
    },

    async clearSelection(): Promise<void> {
      await dependencies.selection.clear();
    },

    async reconcileSelection(): Promise<GenerationTargetSelection | undefined> {
      const selection = await dependencies.selection.get();
      if (selection?.kind === 'comfyui') {
        const workflow = await dependencies.workflows.get(selection.workflowId);
        if ((await workflowReadiness(dependencies, workflow)).status !== 'ready') {
          await dependencies.selection.clear();
          return undefined;
        }
      }
      return selection;
    },
  };
  return service;
}

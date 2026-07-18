import {
  type ComfyUiConnection,
  type ComfyUiConnectionRepository,
  type ComfyUiWorkflowConfig,
  type ComfyUiWorkflowRepository,
  type GenerationTargetSelection,
  type GenerationTargetSelectionRepository,
} from '@imagen-ps/application';
import {
  createBrowserIndexedDbBackend,
  type ChromeKeyValueBackend,
} from './indexed-db-storage';

const PERSISTENCE_SCHEMA_VERSION = 1;
const SELECTION_KEY = 'current';

interface PersistedRecord<T> {
  readonly schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION;
  readonly value: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isCanonicalOrigin(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.search.length === 0
      && parsed.hash.length === 0
      && parsed.pathname === '/'
      && parsed.origin === value;
  } catch {
    return false;
  }
}

function isBridgeEvidence(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'status',
    'protocolVersion',
    'bridgeVersion',
    'frontendVersion',
    'coreVersion',
    'contractSchemaVersion',
    'contractSchemaDigest',
    'nativeQueue',
  ])) {
    return false;
  }
  return (value.status === 'compatible' || value.status === 'incompatible' || value.status === 'unavailable')
    && (value.protocolVersion === undefined || Number.isInteger(value.protocolVersion))
    && (value.bridgeVersion === undefined || typeof value.bridgeVersion === 'string')
    && (value.frontendVersion === undefined || typeof value.frontendVersion === 'string')
    && (value.coreVersion === undefined || typeof value.coreVersion === 'string')
    && (value.contractSchemaVersion === undefined || Number.isInteger(value.contractSchemaVersion))
    && (value.contractSchemaDigest === undefined || typeof value.contractSchemaDigest === 'string')
    && (value.nativeQueue === undefined || typeof value.nativeQueue === 'boolean');
}

function isConnectionTestEvidence(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['checkedAt', 'api', 'bridge'])) {
    return false;
  }
  return isNonEmptyString(value.checkedAt)
    && (value.api === 'ready' || value.api === 'unavailable')
    && (value.bridge === undefined || isBridgeEvidence(value.bridge));
}

function isConnection(value: unknown): value is ComfyUiConnection {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'connectionId',
    'displayName',
    'origin',
    'requestTimeoutMs',
    'configureTimeoutMs',
    'observationTimeoutMs',
    'lastTest',
  ])) {
    return false;
  }
  return isNonEmptyString(value.connectionId)
    && isNonEmptyString(value.displayName)
    && isCanonicalOrigin(value.origin)
    && Number.isInteger(value.requestTimeoutMs)
    && Number(value.requestTimeoutMs) >= 250
    && Number(value.requestTimeoutMs) <= 120_000
    && Number.isInteger(value.configureTimeoutMs)
    && Number(value.configureTimeoutMs) >= 250
    && Number(value.configureTimeoutMs) <= 30_000
    && Number.isInteger(value.observationTimeoutMs)
    && Number(value.observationTimeoutMs) >= 250
    && Number(value.observationTimeoutMs) <= 300_000
    && (value.lastTest === undefined || isConnectionTestEvidence(value.lastTest));
}

function isWorkflowSource(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === 'api-graph') {
    return hasOnlyKeys(value, ['kind', 'graph']) && isRecord(value.graph);
  }
  return value.kind === 'frontend-workflow'
    && hasOnlyKeys(value, ['kind', 'remotePath'])
    && isNonEmptyString(value.remotePath);
}

function isCanonicalContract(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['schemaVersion', 'operation', 'entries'])
    && value.schemaVersion === 1
    && (value.operation === 'text-to-image' || value.operation === 'image-edit')
    && Array.isArray(value.entries);
}

function isWorkflow(value: unknown): value is ComfyUiWorkflowConfig {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'workflowId',
    'displayName',
    'connectionId',
    'source',
    'contract',
  ])) {
    return false;
  }
  return isNonEmptyString(value.workflowId)
    && isNonEmptyString(value.displayName)
    && isNonEmptyString(value.connectionId)
    && isWorkflowSource(value.source)
    && isCanonicalContract(value.contract);
}

function isSelection(value: unknown): value is GenerationTargetSelection {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === 'provider') {
    return hasOnlyKeys(value, ['kind', 'profileId', 'modelId'])
      && isNonEmptyString(value.profileId)
      && (value.modelId === undefined || isNonEmptyString(value.modelId));
  }
  return value.kind === 'comfyui'
    && hasOnlyKeys(value, ['kind', 'workflowId'])
    && isNonEmptyString(value.workflowId);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function snapshot<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('ComfyUI persistence value is not JSON serializable.');
  }
  return deepFreeze(JSON.parse(serialized) as T);
}

function decodeRecord<T>(value: unknown, guard: (candidate: unknown) => candidate is T): T | undefined {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, ['schemaVersion', 'value'])
    || value.schemaVersion !== PERSISTENCE_SCHEMA_VERSION
    || !guard(value.value)
  ) {
    return undefined;
  }
  return snapshot(value.value);
}

function encodeRecord<T>(value: T): PersistedRecord<T> {
  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    value: snapshot(value),
  };
}

function connectionRepository(backend: ChromeKeyValueBackend): ComfyUiConnectionRepository {
  return {
    async list() {
      const connections = backend.listEntries
        ? (await backend.listEntries<unknown>('comfyUiConnections'))
          .map((entry) => {
            const decoded = decodeRecord(entry.value, isConnection);
            return decoded?.connectionId === entry.key ? decoded : undefined;
          })
        : (await backend.list<unknown>('comfyUiConnections'))
          .map((value) => decodeRecord(value, isConnection));
      return connections
        .filter((value): value is ComfyUiConnection => value !== undefined)
        .sort((left, right) => compareText(left.connectionId, right.connectionId));
    },
    async get(connectionId) {
      const decoded = decodeRecord(await backend.get<unknown>('comfyUiConnections', connectionId), isConnection);
      return decoded?.connectionId === connectionId ? decoded : undefined;
    },
    async save(connection) {
      if (!isConnection(connection)) {
        throw new Error('Invalid ComfyUI connection persistence schema.');
      }
      await backend.put('comfyUiConnections', connection.connectionId, encodeRecord(connection));
    },
    async delete(connectionId) {
      await backend.delete('comfyUiConnections', connectionId);
    },
  };
}

function workflowRepository(backend: ChromeKeyValueBackend): ComfyUiWorkflowRepository {
  async function listWorkflows(connectionId?: string): Promise<readonly ComfyUiWorkflowConfig[]> {
    const workflows = backend.listEntries
      ? (await backend.listEntries<unknown>('comfyUiWorkflows'))
        .map((entry) => {
          const decoded = decodeRecord(entry.value, isWorkflow);
          return decoded?.workflowId === entry.key ? decoded : undefined;
        })
      : (await backend.list<unknown>('comfyUiWorkflows'))
        .map((value) => decodeRecord(value, isWorkflow));
    return workflows
      .filter((value): value is ComfyUiWorkflowConfig => (
        value !== undefined && (connectionId === undefined || value.connectionId === connectionId)
      ))
      .sort((left, right) => compareText(left.workflowId, right.workflowId));
  }

  return {
    async list(connectionId) {
      return listWorkflows(connectionId);
    },
    async get(workflowId) {
      const decoded = decodeRecord(await backend.get<unknown>('comfyUiWorkflows', workflowId), isWorkflow);
      return decoded?.workflowId === workflowId ? decoded : undefined;
    },
    async save(workflow) {
      if (!isWorkflow(workflow)) {
        throw new Error('Invalid ComfyUI workflow persistence schema.');
      }
      await backend.put('comfyUiWorkflows', workflow.workflowId, encodeRecord(workflow));
    },
    async delete(workflowId) {
      await backend.delete('comfyUiWorkflows', workflowId);
    },
    async deleteConnection(connectionId) {
      const workflows = await listWorkflows(connectionId);
      for (const workflow of workflows) {
        await backend.delete('comfyUiWorkflows', workflow.workflowId);
      }
    },
  };
}

function selectionRepository(backend: ChromeKeyValueBackend): GenerationTargetSelectionRepository {
  return {
    async get() {
      return decodeRecord(
        await backend.get<unknown>('generationTargetSelection', SELECTION_KEY),
        isSelection,
      );
    },
    async save(selection) {
      if (!isSelection(selection)) {
        throw new Error('Invalid generation target selection persistence schema.');
      }
      await backend.put('generationTargetSelection', SELECTION_KEY, encodeRecord(selection));
    },
    async clear() {
      await backend.delete('generationTargetSelection', SELECTION_KEY);
    },
  };
}

/** 创建 Chrome ComfyUI connection、workflow 与 target selection repositories。 */
export function createChromeComfyUiRepositories(options?: {
  readonly backend?: ChromeKeyValueBackend;
}): {
  readonly connections: ComfyUiConnectionRepository;
  readonly workflows: ComfyUiWorkflowRepository;
  readonly selection: GenerationTargetSelectionRepository;
} {
  const backend = options?.backend ?? createBrowserIndexedDbBackend();
  return {
    connections: connectionRepository(backend),
    workflows: workflowRepository(backend),
    selection: selectionRepository(backend),
  };
}

/** 创建 Chrome ComfyUI connection repository。 */
export function createChromeComfyUiConnectionRepository(
  options?: { readonly backend?: ChromeKeyValueBackend },
): ComfyUiConnectionRepository {
  return createChromeComfyUiRepositories(options).connections;
}

/** 创建 Chrome ComfyUI workflow repository。 */
export function createChromeComfyUiWorkflowRepository(
  options?: { readonly backend?: ChromeKeyValueBackend },
): ComfyUiWorkflowRepository {
  return createChromeComfyUiRepositories(options).workflows;
}

/** 创建 Chrome generation target selection repository。 */
export function createChromeGenerationTargetSelectionRepository(
  options?: { readonly backend?: ChromeKeyValueBackend },
): GenerationTargetSelectionRepository {
  return createChromeComfyUiRepositories(options).selection;
}

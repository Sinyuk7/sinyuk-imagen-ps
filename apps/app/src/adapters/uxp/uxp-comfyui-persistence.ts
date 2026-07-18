import {
  createInMemoryComfyUiConnectionRepository,
  createInMemoryComfyUiWorkflowRepository,
  createInMemoryGenerationTargetSelectionRepository,
  type ComfyUiConnection,
  type ComfyUiConnectionRepository,
  type ComfyUiWorkflowConfig,
  type ComfyUiWorkflowRepository,
  type GenerationTargetSelection,
  type GenerationTargetSelectionRepository,
} from '@imagen-ps/application';
import type { UxpModules } from './uxp-api';

const PERSISTENCE_SCHEMA_VERSION = 1;
const CONNECTIONS_FILE = 'comfyui-connections.json';
const WORKFLOWS_FILE = 'comfyui-workflows.json';
const SELECTION_FILE = 'generation-target-selection.json';

interface UxpFile {
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: string | ArrayBuffer, options?: { readonly format?: unknown }): Promise<void>;
}

interface UxpFolder {
  getEntry(name: string): Promise<UxpFile>;
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<UxpFile>;
}

interface UxpLocalFileSystem {
  readonly formats?: { readonly utf8?: unknown };
  getDataFolder(): Promise<UxpFolder>;
}

interface PersistedCollection<T> {
  readonly schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION;
  readonly records: readonly T[];
}

interface PersistedSelection {
  readonly schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION;
  readonly selection: GenerationTargetSelection | null;
}

function storageFrom(modules: UxpModules): {
  readonly fileSystem?: UxpLocalFileSystem;
  readonly utf8?: unknown;
} {
  const storage = modules.uxp?.storage as {
    readonly formats?: { readonly utf8?: unknown };
    readonly localFileSystem?: UxpLocalFileSystem;
  } | undefined;
  return {
    fileSystem: storage?.localFileSystem,
    utf8: storage?.formats?.utf8 ?? storage?.localFileSystem?.formats?.utf8,
  };
}

async function getOrCreateJsonFile(fileSystem: UxpLocalFileSystem, name: string): Promise<UxpFile> {
  const folder = await fileSystem.getDataFolder();
  try {
    return await folder.getEntry(name);
  } catch {
    return folder.createFile(name, { overwrite: true });
  }
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

function uniqueRecords<T>(records: readonly T[], keyOf: (record: T) => string): readonly T[] {
  const keys = new Set<string>();
  for (const record of records) {
    const key = keyOf(record);
    if (keys.has(key)) {
      return [];
    }
    keys.add(key);
  }
  return records;
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

function decodeCollection<T>(value: unknown, guard: (candidate: unknown) => candidate is T): readonly T[] {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, ['schemaVersion', 'records'])
    || value.schemaVersion !== PERSISTENCE_SCHEMA_VERSION
    || !Array.isArray(value.records)
  ) {
    return [];
  }
  return value.records
    .filter(guard)
    .map((record) => snapshot(record));
}

async function readJson(fileSystem: UxpLocalFileSystem, utf8: unknown, fileName: string): Promise<unknown> {
  try {
    const file = await getOrCreateJsonFile(fileSystem, fileName);
    const raw = await file.read({ format: utf8 });
    const text = String(raw);
    return text.trim().length === 0 ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function writeJson(
  fileSystem: UxpLocalFileSystem,
  utf8: unknown,
  fileName: string,
  value: unknown,
): Promise<void> {
  const file = await getOrCreateJsonFile(fileSystem, fileName);
  await file.write(JSON.stringify(value, null, 2), { format: utf8 });
}

function createFileRepositories(
  fileSystem: UxpLocalFileSystem,
  utf8: unknown,
): {
  readonly connections: ComfyUiConnectionRepository;
  readonly workflows: ComfyUiWorkflowRepository;
  readonly selection: GenerationTargetSelectionRepository;
} {
  async function readConnections(): Promise<readonly ComfyUiConnection[]> {
    const records = decodeCollection(await readJson(fileSystem, utf8, CONNECTIONS_FILE), isConnection);
    return [...uniqueRecords(records, (record) => record.connectionId)]
      .sort((left, right) => compareText(left.connectionId, right.connectionId));
  }

  async function writeConnections(records: readonly ComfyUiConnection[]): Promise<void> {
    const payload: PersistedCollection<ComfyUiConnection> = {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      records: snapshot([...records].sort((left, right) => compareText(left.connectionId, right.connectionId))),
    };
    await writeJson(fileSystem, utf8, CONNECTIONS_FILE, payload);
  }

  async function readWorkflows(): Promise<readonly ComfyUiWorkflowConfig[]> {
    const records = decodeCollection(await readJson(fileSystem, utf8, WORKFLOWS_FILE), isWorkflow);
    return [...uniqueRecords(records, (record) => record.workflowId)]
      .sort((left, right) => compareText(left.workflowId, right.workflowId));
  }

  async function writeWorkflows(records: readonly ComfyUiWorkflowConfig[]): Promise<void> {
    const payload: PersistedCollection<ComfyUiWorkflowConfig> = {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      records: snapshot([...records].sort((left, right) => compareText(left.workflowId, right.workflowId))),
    };
    await writeJson(fileSystem, utf8, WORKFLOWS_FILE, payload);
  }

  const connections: ComfyUiConnectionRepository = {
    async list() {
      return readConnections();
    },
    async get(connectionId) {
      return (await readConnections()).find((record) => record.connectionId === connectionId);
    },
    async save(connection) {
      if (!isConnection(connection)) {
        throw new Error('Invalid ComfyUI connection persistence schema.');
      }
      const records = new Map((await readConnections()).map((record) => [record.connectionId, record]));
      records.set(connection.connectionId, snapshot(connection));
      await writeConnections(Array.from(records.values()));
    },
    async delete(connectionId) {
      await writeConnections((await readConnections()).filter((record) => record.connectionId !== connectionId));
    },
  };

  const workflows: ComfyUiWorkflowRepository = {
    async list(connectionId) {
      const records = await readWorkflows();
      return connectionId === undefined
        ? records
        : records.filter((record) => record.connectionId === connectionId);
    },
    async get(workflowId) {
      return (await readWorkflows()).find((record) => record.workflowId === workflowId);
    },
    async save(workflow) {
      if (!isWorkflow(workflow)) {
        throw new Error('Invalid ComfyUI workflow persistence schema.');
      }
      const records = new Map((await readWorkflows()).map((record) => [record.workflowId, record]));
      records.set(workflow.workflowId, snapshot(workflow));
      await writeWorkflows(Array.from(records.values()));
    },
    async delete(workflowId) {
      await writeWorkflows((await readWorkflows()).filter((record) => record.workflowId !== workflowId));
    },
    async deleteConnection(connectionId) {
      await writeWorkflows((await readWorkflows()).filter((record) => record.connectionId !== connectionId));
    },
  };

  const selection: GenerationTargetSelectionRepository = {
    async get() {
      const parsed = await readJson(fileSystem, utf8, SELECTION_FILE);
      if (
        !isRecord(parsed)
        || !hasOnlyKeys(parsed, ['schemaVersion', 'selection'])
        || parsed.schemaVersion !== PERSISTENCE_SCHEMA_VERSION
        || parsed.selection === null
        || !isSelection(parsed.selection)
      ) {
        return undefined;
      }
      return snapshot(parsed.selection);
    },
    async save(value) {
      if (!isSelection(value)) {
        throw new Error('Invalid generation target selection persistence schema.');
      }
      const payload: PersistedSelection = {
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        selection: snapshot(value),
      };
      await writeJson(fileSystem, utf8, SELECTION_FILE, payload);
    },
    async clear() {
      const payload: PersistedSelection = {
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        selection: null,
      };
      await writeJson(fileSystem, utf8, SELECTION_FILE, payload);
    },
  };

  return { connections, workflows, selection };
}

/** 创建 UXP ComfyUI connection、workflow 与 target selection repositories。 */
export function createUxpComfyUiRepositories(modules: UxpModules): {
  readonly connections: ComfyUiConnectionRepository;
  readonly workflows: ComfyUiWorkflowRepository;
  readonly selection: GenerationTargetSelectionRepository;
} {
  const storage = storageFrom(modules);
  if (!storage.fileSystem) {
    return {
      connections: createInMemoryComfyUiConnectionRepository(),
      workflows: createInMemoryComfyUiWorkflowRepository(),
      selection: createInMemoryGenerationTargetSelectionRepository(),
    };
  }
  return createFileRepositories(storage.fileSystem, storage.utf8);
}

/** 创建 UXP ComfyUI connection repository。 */
export function createUxpComfyUiConnectionRepository(modules: UxpModules): ComfyUiConnectionRepository {
  return createUxpComfyUiRepositories(modules).connections;
}

/** 创建 UXP ComfyUI workflow repository。 */
export function createUxpComfyUiWorkflowRepository(modules: UxpModules): ComfyUiWorkflowRepository {
  return createUxpComfyUiRepositories(modules).workflows;
}

/** 创建 UXP generation target selection repository。 */
export function createUxpGenerationTargetSelectionRepository(
  modules: UxpModules,
): GenerationTargetSelectionRepository {
  return createUxpComfyUiRepositories(modules).selection;
}

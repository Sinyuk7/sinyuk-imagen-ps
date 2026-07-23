import {
  createComfyUiWorkflowDraftStore,
  createComfyUiWorkflowRuntimeCache,
  createInMemoryComfyUiStateRepository,
  normalizePersistedComfyUiState,
  type ComfyUiStateCommitResult,
  type ComfyUiStateRepository,
  type ComfyUiWorkflowDraftStore,
  type ComfyUiWorkflowRuntimeCache,
  type PersistedComfyUiState,
} from '@imagen-ps/application';
import type { UxpModules } from './uxp-api';

const STATE_FILE = 'comfyui-state.json';
const STAGING_FILE = 'comfyui-state.staging.json';
const STATE_SCHEMA_VERSION = 1;

interface UxpFile {
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: string, options?: { readonly format?: unknown }): Promise<void>;
  moveTo(folder: UxpFolder, options?: { readonly overwrite?: boolean; readonly newName?: string }): Promise<void>;
  delete(): Promise<number | void>;
}

interface UxpFolder {
  getEntry(name: string): Promise<UxpFile>;
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<UxpFile>;
}

interface UxpLocalFileSystem {
  readonly formats?: { readonly utf8?: unknown };
  getDataFolder(): Promise<UxpFolder>;
}

function fileSystemFrom(modules: UxpModules): { readonly fileSystem?: UxpLocalFileSystem; readonly utf8?: unknown } {
  const storage = modules.uxp?.storage as {
    readonly formats?: { readonly utf8?: unknown };
    readonly localFileSystem?: UxpLocalFileSystem;
  } | undefined;
  return {
    fileSystem: storage?.localFileSystem,
    utf8: storage?.formats?.utf8 ?? storage?.localFileSystem?.formats?.utf8,
  };
}

async function getEntry(folder: UxpFolder, name: string): Promise<UxpFile | undefined> {
  try {
    return await folder.getEntry(name);
  } catch {
    return undefined;
  }
}

async function cleanupStaging(folder: UxpFolder, bestEffort = false): Promise<void> {
  const staging = await getEntry(folder, STAGING_FILE);
  if (!staging) return;
  try {
    await staging.delete();
  } catch (error) {
    if (!bestEffort) throw error;
  }
}

async function readState(folder: UxpFolder, utf8: unknown): Promise<PersistedComfyUiState | undefined> {
  try {
    const file = await getEntry(folder, STATE_FILE);
    if (!file) return undefined;
    const raw = await file.read({ format: utf8 });
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(new Uint8Array(raw));
    if (!text.trim()) return undefined;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.schemaVersion !== STATE_SCHEMA_VERSION || !parsed.value) return undefined;
    return normalizePersistedComfyUiState(parsed.value);
  } catch { return undefined; }
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => structurallyEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && structurallyEqual(leftRecord[key], rightRecord[key]));
}

/** UXP data-folder 中唯一的 ComfyUI durable state adapter。 */
export function createUxpComfyUiStateRepository(modules: UxpModules): ComfyUiStateRepository {
  const { fileSystem, utf8 } = fileSystemFrom(modules);
  if (!fileSystem) return createInMemoryComfyUiStateRepository();
  let writeLane: Promise<void> = Promise.resolve();

  function runInWriteLane<T>(operation: () => Promise<T>): Promise<T> {
    const result = writeLane.then(operation);
    writeLane = result.then(() => undefined, () => undefined);
    return result;
  }

  async function replacePrimary(dataFolder: UxpFolder, payload: string, signal?: AbortSignal): Promise<'committed' | 'aborted'> {
    if (signal?.aborted) return 'aborted';

    let staging: UxpFile | undefined;
    let replaced = false;
    try {
      staging = await dataFolder.createFile(STAGING_FILE, { overwrite: true });
      if (signal?.aborted) return 'aborted';
      await staging.write(payload, { format: utf8 });
      if (signal?.aborted) return 'aborted';
      await staging.moveTo(dataFolder, { newName: STATE_FILE, overwrite: true });
      replaced = true;
      return 'committed';
    } finally {
      // replace/write error 优先；cleanup 不得遮蔽 primary failure。
      if (!replaced) await cleanupStaging(dataFolder, true);
    }
  }

  return {
    async load() {
      await writeLane;
      const dataFolder = await fileSystem.getDataFolder();
      await cleanupStaging(dataFolder);
      return readState(dataFolder, utf8);
    },
    async save(state) {
      const value = normalizePersistedComfyUiState(state);
      const payload = JSON.stringify({ schemaVersion: STATE_SCHEMA_VERSION, value });
      await runInWriteLane(async () => {
        const dataFolder = await fileSystem.getDataFolder();
        await cleanupStaging(dataFolder);
        await replacePrimary(dataFolder, payload);
      });
    },
    async clear() {
      await runInWriteLane(async () => {
        const dataFolder = await fileSystem.getDataFolder();
        await cleanupStaging(dataFolder);
        await replacePrimary(dataFolder, '');
      });
    },
    async compareAndSave(
      expected: PersistedComfyUiState | undefined,
      next: PersistedComfyUiState,
      signal?: AbortSignal,
    ): Promise<ComfyUiStateCommitResult> {
      const normalizedExpected = expected === undefined ? undefined : normalizePersistedComfyUiState(expected);
      const value = normalizePersistedComfyUiState(next);
      const payload = JSON.stringify({ schemaVersion: STATE_SCHEMA_VERSION, value });
      return runInWriteLane(async () => {
        const dataFolder = await fileSystem.getDataFolder();
        await cleanupStaging(dataFolder);
        if (signal?.aborted) return 'aborted';
        const current = await readState(dataFolder, utf8);
        if (!structurallyEqual(current, normalizedExpected)) return 'conflict';
        if (signal?.aborted) return 'aborted';
        return replacePrimary(dataFolder, payload, signal);
      });
    },
  };
}

export interface UxpComfyUiRepositories {
  readonly state: ComfyUiStateRepository;
  readonly cache: ComfyUiWorkflowRuntimeCache;
  readonly drafts: ComfyUiWorkflowDraftStore;
}

/** 创建 UXP ComfyUI state、runtime cache 与 session draft ports。 */
export function createUxpComfyUiRepositories(modules: UxpModules): UxpComfyUiRepositories {
  return {
    state: createUxpComfyUiStateRepository(modules),
    cache: createComfyUiWorkflowRuntimeCache(),
    drafts: createComfyUiWorkflowDraftStore(),
  };
}

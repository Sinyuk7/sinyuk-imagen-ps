import {
  createComfyUiWorkflowDraftStore,
  createComfyUiWorkflowRuntimeCache,
  createInMemoryComfyUiStateRepository,
  normalizePersistedComfyUiState,
  type ComfyUiStateRepository,
  type ComfyUiWorkflowDraftStore,
  type ComfyUiWorkflowRuntimeCache,
  type PersistedComfyUiState,
} from '@imagen-ps/application';
import type { UxpModules } from './uxp-api';

const STATE_FILE = 'comfyui-state.json';
const STATE_SCHEMA_VERSION = 1;

interface UxpFile {
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: string, options?: { readonly format?: unknown }): Promise<void>;
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

async function getOrCreate(folder: UxpLocalFileSystem, name: string): Promise<UxpFile> {
  const dataFolder = await folder.getDataFolder();
  try { return await dataFolder.getEntry(name); } catch { return dataFolder.createFile(name, { overwrite: true }); }
}

async function readState(fileSystem: UxpLocalFileSystem, utf8: unknown): Promise<PersistedComfyUiState | undefined> {
  try {
    const raw = await (await getOrCreate(fileSystem, STATE_FILE)).read({ format: utf8 });
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(new Uint8Array(raw));
    if (!text.trim()) return undefined;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.schemaVersion !== STATE_SCHEMA_VERSION || !parsed.value) return undefined;
    return normalizePersistedComfyUiState(parsed.value);
  } catch { return undefined; }
}

/** UXP data-folder 中唯一的 ComfyUI durable state adapter。 */
export function createUxpComfyUiStateRepository(modules: UxpModules): ComfyUiStateRepository {
  const { fileSystem, utf8 } = fileSystemFrom(modules);
  if (!fileSystem) return createInMemoryComfyUiStateRepository();
  return {
    load: () => readState(fileSystem, utf8),
    async save(state) {
      const value = normalizePersistedComfyUiState(state);
      const file = await getOrCreate(fileSystem, STATE_FILE);
      await file.write(JSON.stringify({ schemaVersion: STATE_SCHEMA_VERSION, value }), { format: utf8 });
    },
    async clear() {
      const file = await getOrCreate(fileSystem, STATE_FILE);
      await file.write('', { format: utf8 });
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

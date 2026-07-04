import {
  createMemoryPromptSettingsStore,
  normalizePromptSettings,
  type PromptSettings,
  type PromptSettingsStore,
} from '../../shared/ports/prompt-settings';
import type { UxpModules } from './uxp-api';

interface UxpFile {
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: string | ArrayBuffer, options?: { readonly format?: unknown }): Promise<void>;
}

interface UxpFolder {
  getEntry(name: string): Promise<UxpFile>;
  createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<UxpFile>;
}

interface UxpLocalFileSystem {
  readonly formats?: {
    readonly utf8?: unknown;
  };
  getDataFolder(): Promise<UxpFolder>;
}

function localFileSystemFrom(modules: UxpModules): UxpLocalFileSystem | undefined {
  const storage = modules.uxp?.storage as { readonly localFileSystem?: UxpLocalFileSystem } | undefined;
  return storage?.localFileSystem;
}

async function readJsonFile(fs: UxpLocalFileSystem, name: string): Promise<UxpFile | null> {
  const folder = await fs.getDataFolder();
  try {
    return await folder.getEntry(name);
  } catch {
    return null;
  }
}

async function getOrCreateJsonFile(fs: UxpLocalFileSystem, name: string): Promise<UxpFile> {
  const folder = await fs.getDataFolder();
  try {
    return await folder.getEntry(name);
  } catch {
    return folder.createFile(name, { overwrite: true });
  }
}

export function createUxpPromptSettingsStore(modules: UxpModules): PromptSettingsStore {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createMemoryPromptSettingsStore();
  }
  const localFileSystem = fs;
  const fileName = 'prompt-settings.json';

  return {
    async load(): Promise<PromptSettings | null> {
      const file = await readJsonFile(localFileSystem, fileName);
      if (!file) {
        return null;
      }
      try {
        const raw = await file.read({ format: localFileSystem.formats?.utf8 });
        return normalizePromptSettings(JSON.parse(String(raw || '{}')));
      } catch {
        return normalizePromptSettings({});
      }
    },
    async save(settings): Promise<void> {
      const normalized = normalizePromptSettings(settings);
      const file = await getOrCreateJsonFile(localFileSystem, fileName);
      const payload = JSON.stringify(normalized, null, 2);
      await file.write(payload, { format: localFileSystem.formats?.utf8 });
    },
  };
}

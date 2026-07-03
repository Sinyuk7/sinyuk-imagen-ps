import {
  createMemoryGenerationSettingsStore,
  normalizeAppGenerationSettings,
  type AppGenerationSettings,
  type AppGenerationSettingsStore,
} from '../../shared/ports/app-generation-settings';
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

async function getOrCreateJsonFile(fs: UxpLocalFileSystem, name: string): Promise<UxpFile> {
  const folder = await fs.getDataFolder();
  try {
    return await folder.getEntry(name);
  } catch {
    return folder.createFile(name, { overwrite: true });
  }
}

export function createUxpGenerationSettingsStore(modules: UxpModules): AppGenerationSettingsStore {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createMemoryGenerationSettingsStore();
  }
  const localFileSystem = fs;
  const fileName = 'generation-settings.json';

  return {
    async load(): Promise<AppGenerationSettings> {
      const file = await getOrCreateJsonFile(localFileSystem, fileName);
      try {
        const raw = await file.read({ format: localFileSystem.formats?.utf8 });
        return normalizeAppGenerationSettings(JSON.parse(String(raw || '{}')));
      } catch {
        return normalizeAppGenerationSettings({});
      }
    },
    async save(settings): Promise<void> {
      const normalized = normalizeAppGenerationSettings(settings);
      const file = await getOrCreateJsonFile(localFileSystem, fileName);
      const payload = JSON.stringify(normalized, null, 2);
      await file.write(payload, { format: localFileSystem.formats?.utf8 });
    },
  };
}

import type { ProviderProfile, ProviderProfileRepository } from '@imagen-ps/application';
import { createInMemoryProviderProfileRepository } from './in-memory-host-storage';
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

function parseProfiles(raw: string): Map<string, ProviderProfile> {
  if (raw.trim().length === 0) {
    return new Map();
  }
  const parsed = JSON.parse(raw) as { readonly profiles?: readonly ProviderProfile[] };
  return new Map((parsed.profiles ?? []).map((profile) => [profile.profileId, profile]));
}

export function createUxpProviderProfileRepository(modules: UxpModules): ProviderProfileRepository {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createInMemoryProviderProfileRepository();
  }
  const localFileSystem = fs;

  const fileName = 'provider-profiles.json';

  async function readAll(): Promise<Map<string, ProviderProfile>> {
    const file = await getOrCreateJsonFile(localFileSystem, fileName);
    try {
      const raw = await file.read({ format: localFileSystem.formats?.utf8 });
      return parseProfiles(String(raw));
    } catch {
      return new Map();
    }
  }

  async function writeAll(profiles: Map<string, ProviderProfile>): Promise<void> {
    const file = await getOrCreateJsonFile(localFileSystem, fileName);
    const payload = JSON.stringify({ profiles: Array.from(profiles.values()) }, null, 2);
    await file.write(payload, { format: localFileSystem.formats?.utf8 });
  }

  return {
    async list(): Promise<readonly ProviderProfile[]> {
      return Array.from((await readAll()).values());
    },
    async get(profileId: string): Promise<ProviderProfile | undefined> {
      return (await readAll()).get(profileId);
    },
    async save(profile: ProviderProfile): Promise<void> {
      const profiles = await readAll();
      profiles.set(profile.profileId, profile);
      await writeAll(profiles);
    },
    async delete(profileId: string): Promise<void> {
      const profiles = await readAll();
      profiles.delete(profileId);
      await writeAll(profiles);
    },
  };
}

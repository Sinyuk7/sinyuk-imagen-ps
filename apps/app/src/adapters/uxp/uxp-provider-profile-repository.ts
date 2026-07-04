import type { ProviderProfile, ProviderProfileRepository } from '@imagen-ps/application';
import { createInMemoryProviderProfileRepository } from './in-memory-host-storage';
import { createUxpFlightRecorder, type UxpFlightRecorder } from './uxp-log-sink';
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

function profileAttrs(profile: ProviderProfile): Record<string, unknown> {
  return {
    profileId: profile.profileId,
    apiFormat: profile.apiFormat,
    credentialRefCount: Object.keys(profile.secretRefs ?? {}).length,
    configKeyCount: Object.keys(profile.config).length,
  };
}

export function createUxpProviderProfileRepository(modules: UxpModules): ProviderProfileRepository {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createInMemoryProviderProfileRepository();
  }
  const localFileSystem = fs;
  const flightRecorder: UxpFlightRecorder = createUxpFlightRecorder(modules);

  const fileName = 'provider-profiles.json';

  async function readAll(): Promise<Map<string, ProviderProfile>> {
    await flightRecorder.checkpoint('uxp.profile_repository.read.prepare', { fileName });
    const file = await getOrCreateJsonFile(localFileSystem, fileName);
    try {
      await flightRecorder.checkpoint('uxp.profile_repository.read.before_file_read', { fileName });
      const raw = await file.read({ format: localFileSystem.formats?.utf8 });
      await flightRecorder.checkpoint('uxp.profile_repository.read.after_file_read', {
        fileName,
        byteLength: String(raw).length,
      });
      const profiles = parseProfiles(String(raw));
      await flightRecorder.checkpoint('uxp.profile_repository.read.parsed', {
        fileName,
        profileCount: profiles.size,
      });
      return profiles;
    } catch (error) {
      await flightRecorder.fail('uxp.profile_repository.read.failed', error, { fileName });
      return new Map();
    }
  }

  async function writeAll(profiles: Map<string, ProviderProfile>): Promise<void> {
    await flightRecorder.checkpoint('uxp.profile_repository.write.prepare', {
      fileName,
      profileCount: profiles.size,
    });
    const file = await getOrCreateJsonFile(localFileSystem, fileName);
    const payload = JSON.stringify({ profiles: Array.from(profiles.values()) }, null, 2);
    await flightRecorder.checkpoint('uxp.profile_repository.write.before_file_write', {
      fileName,
      profileCount: profiles.size,
      byteLength: payload.length,
    });
    await file.write(payload, { format: localFileSystem.formats?.utf8 });
    await flightRecorder.checkpoint('uxp.profile_repository.write.after_file_write', {
      fileName,
      profileCount: profiles.size,
      byteLength: payload.length,
    });
  }

  return {
    async list(): Promise<readonly ProviderProfile[]> {
      await flightRecorder.checkpoint('uxp.profile_repository.list.start');
      return Array.from((await readAll()).values());
    },
    async get(profileId: string): Promise<ProviderProfile | undefined> {
      await flightRecorder.checkpoint('uxp.profile_repository.get.start', { profileId });
      return (await readAll()).get(profileId);
    },
    async save(profile: ProviderProfile): Promise<void> {
      await flightRecorder.checkpoint('uxp.profile_repository.save.start', profileAttrs(profile), {
        profile_id: profile.profileId,
      });
      const profiles = await readAll();
      profiles.set(profile.profileId, profile);
      await writeAll(profiles);
      await flightRecorder.checkpoint('uxp.profile_repository.save.ok', profileAttrs(profile), {
        profile_id: profile.profileId,
      });
    },
    async delete(profileId: string): Promise<void> {
      await flightRecorder.checkpoint('uxp.profile_repository.delete.start', { profileId });
      const profiles = await readAll();
      profiles.delete(profileId);
      await writeAll(profiles);
      await flightRecorder.checkpoint('uxp.profile_repository.delete.ok', { profileId });
    },
  };
}

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

interface ParsedProfileRecords {
  readonly profiles: Map<string, ProviderProfile>;
  readonly rejectedProfileIds: readonly string[];
}

const API_FORMATS = new Set(['openai-images', 'openai-chat-completions', 'gemini-generate-content']);

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

function profileIdOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const profileId = (value as { readonly profileId?: unknown }).profileId;
  return typeof profileId === 'string' && profileId.length > 0 ? profileId : undefined;
}

function isProviderProfileRecord(value: unknown): value is ProviderProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ProviderProfile> & { readonly apiFormat?: unknown; readonly config?: unknown };
  return (
    typeof record.profileId === 'string' &&
    API_FORMATS.has(String(record.apiFormat)) &&
    typeof record.displayName === 'string' &&
    typeof record.enabled === 'boolean' &&
    typeof record.config === 'object' &&
    record.config !== null &&
    !Array.isArray(record.config) &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  );
}

function parseProfiles(raw: string): ParsedProfileRecords {
  if (raw.trim().length === 0) {
    return { profiles: new Map(), rejectedProfileIds: [] };
  }
  const parsed = JSON.parse(raw) as { readonly profiles?: readonly unknown[] };
  const profiles = new Map<string, ProviderProfile>();
  const rejectedProfileIds: string[] = [];
  for (const profile of parsed.profiles ?? []) {
    if (isProviderProfileRecord(profile)) {
      profiles.set(profile.profileId, profile);
    } else {
      rejectedProfileIds.push(profileIdOf(profile) ?? '<unknown>');
    }
  }
  return { profiles, rejectedProfileIds };
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
      const parsed = parseProfiles(String(raw));
      await flightRecorder.checkpoint('uxp.profile_repository.read.parsed', {
        fileName,
        profileCount: parsed.profiles.size,
        rejectedProfileCount: parsed.rejectedProfileIds.length,
      });
      if (parsed.rejectedProfileIds.length > 0) {
        await flightRecorder.checkpoint('uxp.profile_repository.read.rejected_legacy_profiles', {
          fileName,
          profileIds: parsed.rejectedProfileIds,
        });
      }
      return parsed.profiles;
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

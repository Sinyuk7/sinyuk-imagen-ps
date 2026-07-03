import { createMemoryActiveImageProfileStore, type ActiveImageProfileStore } from '../../shared/ports/active-image-profile';
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

interface PersistedActiveImageProfileFile {
  readonly activeImageProfileId?: string | null;
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

function normalizePersistedActiveImageProfile(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as PersistedActiveImageProfileFile;
  return typeof record.activeImageProfileId === 'string' ? record.activeImageProfileId : null;
}

export function createUxpActiveImageProfileStore(modules: UxpModules): ActiveImageProfileStore {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createMemoryActiveImageProfileStore();
  }
  const localFileSystem = fs;
  const flightRecorder: UxpFlightRecorder = createUxpFlightRecorder(modules);
  const fileName = 'active-image-profile.json';

  return {
    async load(): Promise<string | null> {
      await flightRecorder.checkpoint('uxp.active_image_profile.read.prepare', { fileName });
      const file = await getOrCreateJsonFile(localFileSystem, fileName);
      try {
        await flightRecorder.checkpoint('uxp.active_image_profile.read.before_file_read', { fileName });
        const raw = await file.read({ format: localFileSystem.formats?.utf8 });
        const profileId = normalizePersistedActiveImageProfile(JSON.parse(String(raw || '{}')));
        await flightRecorder.checkpoint('uxp.active_image_profile.read.ok', {
          fileName,
          hasProfileId: profileId !== null,
        });
        return profileId;
      } catch (error) {
        await flightRecorder.fail('uxp.active_image_profile.read.failed', error, { fileName });
        return null;
      }
    },
    async save(profileId: string | null): Promise<void> {
      await flightRecorder.checkpoint('uxp.active_image_profile.write.prepare', {
        fileName,
        hasProfileId: profileId !== null,
      });
      const file = await getOrCreateJsonFile(localFileSystem, fileName);
      const payload = JSON.stringify({ activeImageProfileId: profileId }, null, 2);
      await flightRecorder.checkpoint('uxp.active_image_profile.write.before_file_write', {
        fileName,
        hasProfileId: profileId !== null,
        byteLength: payload.length,
      });
      await file.write(payload, { format: localFileSystem.formats?.utf8 });
      await flightRecorder.checkpoint('uxp.active_image_profile.write.ok', {
        fileName,
        hasProfileId: profileId !== null,
      });
    },
  };
}

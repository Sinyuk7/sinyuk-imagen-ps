import type {
  ModelDiscoveryCache,
  ModelDiscoveryCacheRepository,
  UserModelConfig,
  UserModelConfigRepository,
} from '@imagen-ps/application';
import {
  createInMemoryModelDiscoveryCacheRepository,
  createInMemoryUserModelConfigRepository,
} from './in-memory-host-storage';
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

function isApiFormat(value: unknown): value is UserModelConfig['apiFormat'] {
  return value === 'openai-images' || value === 'openai-chat-completions' || value === 'gemini-generate-content';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isModelDiscoveryCache(value: unknown): value is ModelDiscoveryCache {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ModelDiscoveryCache>;
  return typeof record.profileId === 'string' &&
    isStringArray(record.modelIds) &&
    typeof record.refreshedAt === 'string';
}

function isUserModelConfig(value: unknown): value is UserModelConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<UserModelConfig>;
  const output = record.output;
  return isApiFormat(record.apiFormat) &&
    typeof record.modelId === 'string' &&
    typeof record.requestStrategyId === 'string' &&
    typeof output === 'object' &&
    output !== null &&
    !Array.isArray(output) &&
    isStringArray(output.aspectRatios) &&
    isStringArray(output.sizes) &&
    isStringArray(output.outputFormats);
}

async function readJsonArray<T>(
  fs: UxpLocalFileSystem,
  fileName: string,
  key: string,
  guard: (value: unknown) => value is T,
): Promise<readonly T[]> {
  const file = await getOrCreateJsonFile(fs, fileName);
  try {
    const raw = String(await file.read({ format: fs.formats?.utf8 }));
    if (raw.trim().length === 0) {
      return [];
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const values = Array.isArray(parsed[key]) ? parsed[key] : [];
    return values.filter(guard);
  } catch {
    return [];
  }
}

async function writeJsonArray<T>(
  fs: UxpLocalFileSystem,
  fileName: string,
  key: string,
  values: readonly T[],
): Promise<void> {
  const file = await getOrCreateJsonFile(fs, fileName);
  await file.write(JSON.stringify({ [key]: values }, null, 2), { format: fs.formats?.utf8 });
}

export function createUxpModelDiscoveryCacheRepository(modules: UxpModules): ModelDiscoveryCacheRepository {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createInMemoryModelDiscoveryCacheRepository();
  }
  const localFileSystem = fs;
  const fileName = 'model-discovery-cache.json';
  const key = 'caches';

  async function readAll(): Promise<Map<string, ModelDiscoveryCache>> {
    return new Map((await readJsonArray(localFileSystem, fileName, key, isModelDiscoveryCache)).map((cache) => [cache.profileId, cache]));
  }

  async function writeAll(caches: Map<string, ModelDiscoveryCache>): Promise<void> {
    await writeJsonArray(localFileSystem, fileName, key, Array.from(caches.values()));
  }

  return {
    async get(profileId) {
      return (await readAll()).get(profileId);
    },
    async put(cache) {
      const caches = await readAll();
      caches.set(cache.profileId, cache);
      await writeAll(caches);
    },
    async delete(profileId) {
      const caches = await readAll();
      caches.delete(profileId);
      await writeAll(caches);
    },
  };
}

function userModelConfigKey(config: Pick<UserModelConfig, 'apiFormat' | 'modelId'>): string {
  return `${config.apiFormat}:${config.modelId}`;
}

export function createUxpUserModelConfigRepository(modules: UxpModules): UserModelConfigRepository {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createInMemoryUserModelConfigRepository();
  }
  const localFileSystem = fs;
  const fileName = 'user-model-configs.json';
  const key = 'configs';

  async function readAll(): Promise<Map<string, UserModelConfig>> {
    return new Map((await readJsonArray(localFileSystem, fileName, key, isUserModelConfig)).map((config) => [userModelConfigKey(config), config]));
  }

  async function writeAll(configs: Map<string, UserModelConfig>): Promise<void> {
    await writeJsonArray(localFileSystem, fileName, key, Array.from(configs.values()));
  }

  return {
    async list(apiFormat) {
      const configs = Array.from((await readAll()).values());
      return apiFormat === undefined ? configs : configs.filter((config) => config.apiFormat === apiFormat);
    },
    async get(apiFormat, modelId) {
      return (await readAll()).get(`${apiFormat}:${modelId}`);
    },
    async save(config) {
      const configs = await readAll();
      configs.set(userModelConfigKey(config), config);
      await writeAll(configs);
    },
    async delete(apiFormat, modelId) {
      const configs = await readAll();
      configs.delete(`${apiFormat}:${modelId}`);
      await writeAll(configs);
    },
  };
}

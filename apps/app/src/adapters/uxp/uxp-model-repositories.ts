import type {
  ImageOutputMatrix,
  ModelDiscoveryCache,
  ModelDiscoveryCacheRepository,
  ModelGenerationPreference,
  ModelGenerationPreferenceRepository,
  UserModelConfig,
  UserModelConfigRepository,
} from '@imagen-ps/application';
import {
  createInMemoryModelGenerationPreferenceRepository,
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  if (!isPlainRecord(value)) {
    return false;
  }
  return value.output === undefined &&
    isApiFormat(value.apiFormat) &&
    typeof value.modelId === 'string' &&
    typeof value.baseModelId === 'string' &&
    typeof value.requestStrategyId === 'string' &&
    Array.isArray(value.outputMatrix) &&
    value.outputMatrix.length > 0 &&
    value.outputMatrix.every(isImageOutputMatrix);
}

function isMatrixOperation(value: unknown): value is ImageOutputMatrix['operation'] {
  return value === 'text_to_image' || value === 'image_edit';
}

function isImageOutputMatrix(value: unknown): value is ImageOutputMatrix {
  if (!isPlainRecord(value) || !isMatrixOperation(value.operation)) {
    return false;
  }
  return Array.isArray(value.imageSizes) &&
    Array.isArray(value.ratios) &&
    Array.isArray(value.outputFormats) &&
    typeof value.defaultCellId === 'string' &&
    Array.isArray(value.cells) &&
    value.cells.length > 0 &&
    value.cells.every((cell) =>
      isPlainRecord(cell) &&
      typeof cell.id === 'string' &&
      typeof cell.imageSize === 'string' &&
      cell.imageSize !== '512' &&
      typeof cell.ratio === 'string' &&
      typeof cell.outputFormat === 'string' &&
      isPlainRecord(cell.requestOutput),
    );
}

function isImageOperation(value: unknown): value is ModelGenerationPreference['operation'] {
  return value === 'text_to_image' || value === 'image_edit';
}

function isImageSize(value: unknown): value is ModelGenerationPreference['imageSize'] {
  return value === 'auto' || value === '1k' || value === '2k' || value === '4k';
}

function isImageRatio(value: unknown): value is ModelGenerationPreference['ratio'] {
  return value === 'auto' || value === 'source' || value === '1:1' || value === '16:9' || value === '9:16';
}

function isOutputFormat(value: unknown): value is ModelGenerationPreference['outputFormat'] {
  return value === 'png' || value === 'jpeg' || value === 'webp';
}

function isModelGenerationPreference(value: unknown): value is ModelGenerationPreference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ModelGenerationPreference> & { readonly requestOutput?: unknown };
  return record.requestOutput === undefined &&
    typeof record.profileId === 'string' &&
    isApiFormat(record.apiFormat) &&
    typeof record.modelId === 'string' &&
    isImageOperation(record.operation) &&
    typeof record.cellId === 'string' &&
    isImageSize(record.imageSize) &&
    isImageRatio(record.ratio) &&
    isOutputFormat(record.outputFormat);
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

function modelGenerationPreferenceKey(config: Pick<ModelGenerationPreference, 'profileId' | 'apiFormat' | 'modelId' | 'operation'>): string {
  return `${config.profileId}:${config.apiFormat}:${config.modelId}:${config.operation}`;
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

export function createUxpModelGenerationPreferenceRepository(modules: UxpModules): ModelGenerationPreferenceRepository {
  const fs = localFileSystemFrom(modules);
  if (!fs) {
    return createInMemoryModelGenerationPreferenceRepository();
  }
  const localFileSystem = fs;
  const fileName = 'model-generation-preferences.json';
  const key = 'preferences';

  async function readAll(): Promise<Map<string, ModelGenerationPreference>> {
    return new Map((await readJsonArray(localFileSystem, fileName, key, isModelGenerationPreference)).map((preference) => [modelGenerationPreferenceKey(preference), preference]));
  }

  async function writeAll(preferences: Map<string, ModelGenerationPreference>): Promise<void> {
    await writeJsonArray(localFileSystem, fileName, key, Array.from(preferences.values()));
  }

  return {
    async get(preferenceKey) {
      return (await readAll()).get(modelGenerationPreferenceKey(preferenceKey));
    },
    async save(preference) {
      const preferences = await readAll();
      preferences.set(modelGenerationPreferenceKey(preference), preference);
      await writeAll(preferences);
    },
    async delete(preferenceKey) {
      const preferences = await readAll();
      preferences.delete(modelGenerationPreferenceKey(preferenceKey));
      await writeAll(preferences);
    },
  };
}

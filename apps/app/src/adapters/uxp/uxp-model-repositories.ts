import type {
  CatalogParameterPreference,
  CatalogParameterPreferenceRepository,
  ProviderAccount,
  ProviderAccountRepository,
} from '@imagen-ps/application';
import type { UxpModules } from './uxp-api';

interface UxpFile {
  read(options?: { readonly format?: unknown }): Promise<string | ArrayBuffer>;
  write(data: string | ArrayBuffer, options?: { readonly format?: unknown }): Promise<void>;
}
interface UxpFolder { getEntry(name: string): Promise<UxpFile>; createFile(name: string, options?: { readonly overwrite?: boolean }): Promise<UxpFile>; }
interface UxpLocalFileSystem { readonly formats?: { readonly utf8?: unknown }; getDataFolder(): Promise<UxpFolder>; }

function localFileSystemFrom(modules: UxpModules): UxpLocalFileSystem | undefined {
  return (modules.uxp?.storage as { readonly localFileSystem?: UxpLocalFileSystem } | undefined)?.localFileSystem;
}
async function getOrCreateJsonFile(fs: UxpLocalFileSystem, name: string): Promise<UxpFile> {
  const folder = await fs.getDataFolder();
  try { return await folder.getEntry(name); } catch { return folder.createFile(name, { overwrite: true }); }
}
function isPlainRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
async function readJsonArray<T>(fs: UxpLocalFileSystem, fileName: string, key: string, guard: (value: unknown) => value is T): Promise<readonly T[]> {
  const file = await getOrCreateJsonFile(fs, fileName);
  try {
    const raw = String(await file.read({ format: fs.formats?.utf8 }));
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return (Array.isArray(parsed[key]) ? parsed[key] : []).filter(guard);
  } catch { return []; }
}
async function writeJsonArray<T>(fs: UxpLocalFileSystem, fileName: string, key: string, values: readonly T[]): Promise<void> {
  const file = await getOrCreateJsonFile(fs, fileName);
  await file.write(JSON.stringify({ [key]: values }, null, 2), { format: fs.formats?.utf8 });
}

/** UXP 文件中的固定 provider 单账号仓库。 */
export function createUxpProviderAccountRepository(modules: UxpModules): ProviderAccountRepository {
  const fs = localFileSystemFrom(modules);
  const memory = new Map<string, ProviderAccount>();
  if (!fs) return { async list() { return Array.from(memory.values()); }, async get(id) { return memory.get(id); }, async save(value) { memory.set(value.providerId, value); }, async delete(id) { memory.delete(id); } };
  const fileName = 'provider-accounts.json';
  const valid = (value: unknown): value is ProviderAccount => isPlainRecord(value) && (value.providerId === 'grsai' || value.providerId === 'runninghub') && typeof value.displayName === 'string' && (value.secretRef === undefined || typeof value.secretRef === 'string') && (value.billingTokenSecretRef === undefined || typeof value.billingTokenSecretRef === 'string') && (value.baseUrl === undefined || typeof value.baseUrl === 'string') && typeof value.updatedAt === 'string';
  const read = async () => new Map((await readJsonArray(fs, fileName, 'accounts', valid)).map((value) => [value.providerId, value]));
  const write = async (values: Map<string, ProviderAccount>) => writeJsonArray(fs, fileName, 'accounts', Array.from(values.values()));
  return { async list() { return Array.from((await read()).values()); }, async get(id) { return (await read()).get(id); }, async save(value) { const values = await read(); values.set(value.providerId, value); await write(values); }, async delete(id) { const values = await read(); values.delete(id); await write(values); } };
}

/** UXP 文件中的固定 provider/model 参数偏好仓库。 */
export function createUxpCatalogParameterPreferenceRepository(modules: UxpModules): CatalogParameterPreferenceRepository {
  const fs = localFileSystemFrom(modules);
  const memory = new Map<string, CatalogParameterPreference>();
  if (!fs) return { async get(providerId, modelId) { return memory.get(`${providerId}:${modelId}`); }, async save(value) { memory.set(`${value.providerId}:${value.modelId}`, value); }, async delete(providerId, modelId) { memory.delete(`${providerId}:${modelId}`); } };
  const fileName = 'catalog-parameter-preferences.json';
  const valid = (value: unknown): value is CatalogParameterPreference => isPlainRecord(value) && (value.providerId === 'grsai' || value.providerId === 'runninghub') && typeof value.modelId === 'string' && value.modelId.trim().length > 0 && isPlainRecord(value.values) && Object.values(value.values).every((item) => typeof item === 'string') && typeof value.updatedAt === 'string';
  const read = async () => new Map((await readJsonArray(fs, fileName, 'preferences', valid)).map((value) => [`${value.providerId}:${value.modelId}`, value]));
  const write = async (values: Map<string, CatalogParameterPreference>) => writeJsonArray(fs, fileName, 'preferences', Array.from(values.values()));
  return { async get(providerId, modelId) { return (await read()).get(`${providerId}:${modelId}`); }, async save(value) { const values = await read(); values.set(`${value.providerId}:${value.modelId}`, value); await write(values); }, async delete(providerId, modelId) { const values = await read(); values.delete(`${providerId}:${modelId}`); await write(values); } };
}

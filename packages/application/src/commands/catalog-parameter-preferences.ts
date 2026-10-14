import type { FixedProviderId } from '@imagen-ps/providers';
import { getCatalogParameterPreferenceRepository } from '../runtime.js';
import type { CatalogParameterPreference, CommandResult } from './types.js';

function isFixedProviderId(value: unknown): value is FixedProviderId {
  return value === 'grsai' || value === 'runninghub';
}

function isParameterValues(value: unknown): value is Readonly<Record<string, string>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.entries(value).every(([name, parameterValue]) => name.length > 0 && typeof parameterValue === 'string');
}

/** 读取固定 provider/model 的参数偏好。 */
export async function getCatalogParameterPreference(providerId: FixedProviderId, modelId: string): Promise<CommandResult<CatalogParameterPreference | null>> {
  if (!isFixedProviderId(providerId) || typeof modelId !== 'string' || !modelId.trim()) return { ok: false, error: new Error('A fixed provider and model ID are required.') as never };
  try { return { ok: true, value: (await getCatalogParameterPreferenceRepository().get(providerId, modelId)) ?? null }; }
  catch (error) { return { ok: false, error: new Error(error instanceof Error ? error.message : String(error)) as never }; }
}

/** 保存固定 provider/model 的参数偏好。 */
export async function saveCatalogParameterPreference(input: { readonly providerId: FixedProviderId; readonly modelId: string; readonly values: Readonly<Record<string, string>> }): Promise<CommandResult<CatalogParameterPreference>> {
  if (!input || !isFixedProviderId(input.providerId) || typeof input.modelId !== 'string' || !input.modelId.trim() || !isParameterValues(input.values)) {
    return { ok: false, error: new Error('Catalog parameter preference is invalid.') as never };
  }
  const preference: CatalogParameterPreference = { ...input, updatedAt: new Date().toISOString() };
  try { await getCatalogParameterPreferenceRepository().save(preference); return { ok: true, value: preference }; }
  catch (error) { return { ok: false, error: new Error(error instanceof Error ? error.message : String(error)) as never }; }
}

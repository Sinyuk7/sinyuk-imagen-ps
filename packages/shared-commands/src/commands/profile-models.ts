/**
 * Profile model & flag commands.
 *
 * 本模块在不动 dispatch / 三级优先级 / secret 边界的前提下，提供与
 * provider profile 的 model 候选、`enabled` 开关相关的 surface-agnostic
 * 命令：
 *
 * - `listProfileModels(profileId)`：fallback chain `profile.models` →
 *   `descriptor.defaultModels` → `[]`，不做任何网络调用。
 * - `refreshProfileModels(profileId)`：调用 implementation 的
 *   `discoverModels(config)`；成功时覆盖 `profile.models` 缓存，失败时
 *   不擦除已有缓存、不持久化任何失败状态。
 * - `setProfileDefaultModel(profileId, modelId)`：严格校验
 *   `modelId ∈ listProfileModels(profileId)`，命中则写入
 *   `config.defaultModel`，不提供 force 旁路。
 * - `setProfileEnabled(profileId, enabled)`：仅翻转 `enabled` 字段，幂等。
 */

import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { getProviderConfigResolver, getProviderProfileRepository, getRuntime } from '../runtime.js';
import type { CommandResult, ProviderProfile } from './types.js';
import type { ProviderModelInfo } from '@imagen-ps/providers';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function sanitizeProfile(profile: ProviderProfile): ProviderProfile {
  return { ...profile };
}

/**
 * 列出 provider profile 的 model 候选清单。
 *
 * INTENT: 提供 surface-agnostic 的 model 候选获取通路。
 * INPUT: profileId。
 * OUTPUT: 按 fallback chain 解析后的 `readonly ProviderModelInfo[]`。
 * SIDE EFFECT: 无（不发起网络、不写入持久化）。
 * FAILURE: profile 不存在 / providerId 未注册 → validation error。
 */
export async function listProfileModels(profileId: string): Promise<CommandResult<readonly ProviderModelInfo[]>> {
  const profile = await getProviderProfileRepository().get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }
  const provider = getRuntime().providerRegistry.get(profile.providerId);
  if (!provider) {
    return {
      ok: false,
      error: createValidationError(
        `Provider implementation "${profile.providerId}" not found for profile "${profileId}".`,
        { profileId, providerId: profile.providerId },
      ),
    };
  }

  // fallback chain: profile.models → descriptor.defaultModels → []
  if (profile.models && profile.models.length > 0) {
    return { ok: true, value: profile.models };
  }
  const defaults = provider.describe().defaultModels;
  if (defaults && defaults.length > 0) {
    return { ok: true, value: defaults };
  }
  return { ok: true, value: [] };
}

/**
 * 触发一次 model discovery 并把结果写入 `profile.models` 缓存。
 *
 * INTENT: 让用户主动触发 implementation 的 discovery，并在成功时刷新缓存。
 * INPUT: profileId。
 * OUTPUT: 成功时返回新 model 列表（含空数组）。
 * SIDE EFFECT: 仅在成功时写 repository；失败时 `profile.models` 维持原值。
 * FAILURE:
 *   - profile 不存在 / config resolve 失败 / implementation 未实现 discoverModels
 *     → validation error（不修改 profile）。
 *   - discoverModels 抛错 → provider error（不修改 profile）。
 */
export async function refreshProfileModels(profileId: string): Promise<CommandResult<readonly ProviderModelInfo[]>> {
  const repository = getProviderProfileRepository();
  const profile = await repository.get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }

  let providerConfig: unknown;
  try {
    const resolved = await getProviderConfigResolver().resolve(profileId);
    providerConfig = resolved.providerConfig;
  } catch (error) {
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Provider profile "${profileId}" validation failed.`), {
        profileId,
      }),
    };
  }

  const provider = getRuntime().providerRegistry.get(profile.providerId);
  if (!provider) {
    return {
      ok: false,
      error: createValidationError(
        `Provider implementation "${profile.providerId}" not found for profile "${profileId}".`,
        { profileId, providerId: profile.providerId },
      ),
    };
  }

  if (typeof provider.discoverModels !== 'function') {
    return {
      ok: false,
      error: createValidationError(
        `Provider implementation "${profile.providerId}" does not support model discovery.`,
        { profileId, providerId: profile.providerId },
      ),
    };
  }

  let models: readonly ProviderModelInfo[];
  try {
    models = await provider.discoverModels(providerConfig as never);
  } catch (error) {
    // Sanitize secret leakage: only forward `Error.message`, never raw error or
    // resolved config; the provider implementation owns "no secret in messages".
    return {
      ok: false,
      error: createProviderError(errorMessage(error, `Model discovery failed for profile "${profileId}".`), {
        profileId,
        providerId: profile.providerId,
      }),
    };
  }

  const updated: ProviderProfile = {
    ...profile,
    models,
    updatedAt: new Date().toISOString(),
  };
  try {
    await repository.save(updated);
  } catch (error) {
    return {
      ok: false,
      error: createProviderError(
        errorMessage(error, `Failed to persist refreshed models for profile "${profileId}".`),
        { profileId, providerId: profile.providerId },
      ),
    };
  }

  return { ok: true, value: models };
}

/**
 * 设置 profile 的 `config.defaultModel`，严格校验 modelId 在 candidate list 中。
 *
 * INTENT: surface-agnostic 的 default-model 设定，CLI 与 UXP 共用同一 contract。
 * INPUT: profileId, modelId。
 * OUTPUT: 更新后的 profile。
 * SIDE EFFECT: repository 写入，secret 与 models cache 不变。
 * FAILURE:
 *   - profile 不存在 → validation error。
 *   - candidate list 为空或未命中 → validation error，不修改 profile。
 */
export async function setProfileDefaultModel(
  profileId: string,
  modelId: string,
): Promise<CommandResult<ProviderProfile>> {
  const repository = getProviderProfileRepository();
  const profile = await repository.get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }

  const candidates = await listProfileModels(profileId);
  if (!candidates.ok) {
    return { ok: false, error: candidates.error };
  }

  const hit = candidates.value.find((m) => m.id === modelId);
  if (!hit) {
    const available = candidates.value.map((m) => m.id);
    return {
      ok: false,
      error: createValidationError(
        candidates.value.length === 0
          ? `Model "${modelId}" is not available: profile "${profileId}" has no candidate models. Run "imagen profile refresh-models <id>" or ensure the implementation declares defaultModels.`
          : `Model "${modelId}" is not in the candidate list for profile "${profileId}". Available: [${available.join(', ')}].`,
        { profileId, modelId, available },
      ),
    };
  }

  const nextConfig = { ...profile.config, defaultModel: modelId };
  const updated: ProviderProfile = {
    ...profile,
    config: nextConfig,
    updatedAt: new Date().toISOString(),
  };

  try {
    await repository.save(updated);
  } catch (error) {
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Failed to persist defaultModel for profile "${profileId}".`), {
        profileId,
        modelId,
      }),
    };
  }

  return { ok: true, value: sanitizeProfile(updated) };
}

/**
 * 翻转 profile.enabled 标志，幂等。
 *
 * INTENT: 提供与 lifecycle save 解耦的 enable/disable 通路。
 * INPUT: profileId, enabled。
 * OUTPUT: 更新后的 profile。
 * SIDE EFFECT: repository 写入，所有其他字段保留。
 * FAILURE: profile 不存在 → validation error。
 */
export async function setProfileEnabled(profileId: string, enabled: boolean): Promise<CommandResult<ProviderProfile>> {
  const repository = getProviderProfileRepository();
  const profile = await repository.get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }

  if (profile.enabled === enabled) {
    // 幂等：状态已一致，仍返回成功，但避免不必要的 updatedAt bump。
    return { ok: true, value: sanitizeProfile(profile) };
  }

  const updated: ProviderProfile = {
    ...profile,
    enabled,
    updatedAt: new Date().toISOString(),
  };

  try {
    await repository.save(updated);
  } catch (error) {
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Failed to persist enabled state for profile "${profileId}".`), {
        profileId,
        enabled,
      }),
    };
  }

  return { ok: true, value: sanitizeProfile(updated) };
}

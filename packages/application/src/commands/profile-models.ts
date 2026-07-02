/**
 * Profile model commands.
 *
 * 本模块在不动 dispatch / secret 边界的前提下，提供与 provider profile
 * 的 model 候选相关的 surface-agnostic 命令：
 *
 * - `listProfileModels(profileId)`：候选来源 `profile.models` →
 *   `descriptor.defaultModels` → `[]`，不做任何网络调用。
 * - `refreshProfileModels(profileId)`：调用 implementation 的
 *   `discoverModels(config)`；成功时覆盖 `profile.models` 缓存，失败时
 *   不擦除已有缓存、不持久化任何失败状态。
 */

import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import { getProviderConfigResolver, getProviderProfileRepository, getRuntime, getRuntimeLogger } from '../runtime.js';
import type { CommandResult, ProviderProfile } from './types.js';
import type { ProviderModelInfo } from '@imagen-ps/providers';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function mergeConfiguredDefaultModel(
  models: readonly ProviderModelInfo[],
  defaultModel: unknown,
): readonly ProviderModelInfo[] {
  const configured = typeof defaultModel === 'string' ? defaultModel.trim() : '';
  if (configured.length === 0 || models.some((model) => model.id === configured)) {
    return models;
  }
  return [{ id: configured, displayName: configured }, ...models];
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
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.model.list');

  const profile = await getProviderProfileRepository().get(profileId);
  if (!profile) {
    span.fail({ message: `Provider profile "${profileId}" not found.` });
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }
  const provider = getRuntime().providerRegistry.get(profile.providerId);
  if (!provider) {
    span.fail({ message: `Provider implementation "${profile.providerId}" not found for profile "${profileId}".` });
    return {
      ok: false,
      error: createValidationError(
        `Provider implementation "${profile.providerId}" not found for profile "${profileId}".`,
        { profileId, providerId: profile.providerId },
      ),
    };
  }

  // Candidate chain: profile.models → descriptor.defaultModels → []，然后把
  // 当前 config.defaultModel 作为 surface-side 当前值并入返回结果（仅按 id
  // 去重，不写回 discovery cache）。
  const descriptorDefaults = provider.describe().defaultModels ?? [];
  const baseModels = profile.models && profile.models.length > 0
    ? profile.models
    : descriptorDefaults;
  const mergedModels = mergeConfiguredDefaultModel(baseModels, profile.config.defaultModel);
  span.finish({
    source: profile.models && profile.models.length > 0
      ? 'profile.cache'
      : descriptorDefaults.length > 0
        ? 'provider.defaults'
        : 'none',
    count: mergedModels.length,
  });
  return { ok: true, value: mergedModels };
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
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.model.refresh');

  const repository = getProviderProfileRepository();
  const profile = await repository.get(profileId);
  if (!profile) {
    span.fail({ message: `Provider profile "${profileId}" not found.` });
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
    span.fail(error);
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Provider profile "${profileId}" validation failed.`), {
        profileId,
      }),
    };
  }

  const provider = getRuntime().providerRegistry.get(profile.providerId);
  if (!provider) {
    span.fail({ message: `Provider implementation "${profile.providerId}" not found for profile "${profileId}".` });
    return {
      ok: false,
      error: createValidationError(
        `Provider implementation "${profile.providerId}" not found for profile "${profileId}".`,
        { profileId, providerId: profile.providerId },
      ),
    };
  }

  if (typeof provider.discoverModels !== 'function') {
    span.fail({ message: `Provider implementation "${profile.providerId}" does not support model discovery.` });
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
    span.fail(error);
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
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(
        errorMessage(error, `Failed to persist refreshed models for profile "${profileId}".`),
        { profileId, providerId: profile.providerId },
      ),
    };
  }

  span.finish({ count: models.length });
  return { ok: true, value: models };
}

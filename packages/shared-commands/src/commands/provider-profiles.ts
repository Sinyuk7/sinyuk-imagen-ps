import { createRuntimeError, createValidationError } from '@imagen-ps/core-engine';
import {
  getProviderConfigResolver,
  getProviderProfileRepository,
  getRuntime,
  getSecretStorageAdapter,
} from '../runtime.js';
import type {
  CommandResult,
  DeleteProviderProfileOptions,
  ProviderProfile,
  ProviderProfileInput,
  ProviderProfileTestResult,
} from './types.js';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createSecretRef(profileId: string, secretName: string): string {
  return `secret:provider-profile:${profileId}:${secretName}`;
}

function normalizeProviderId(input: ProviderProfileInput): string {
  return input.providerId ?? input.family;
}

function sanitizeProfile(profile: ProviderProfile): ProviderProfile {
  return { ...profile };
}

/** 列出已保存的 provider profiles，不返回 secret values。 */
export async function listProviderProfiles(): Promise<CommandResult<readonly ProviderProfile[]>> {
  const profiles = await getProviderProfileRepository().list();
  return { ok: true, value: profiles.map(sanitizeProfile) };
}

/** 获取单个 provider profile，不存在时返回 validation error。 */
export async function getProviderProfile(profileId: string): Promise<CommandResult<ProviderProfile>> {
  const profile = await getProviderProfileRepository().get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }
  return { ok: true, value: sanitizeProfile(profile) };
}

/**
 * 保存 provider profile。
 *
 * INTENT: 将 write-only secretValues 写入 SecretStorageAdapter，并只把 sanitized profile 保存到 repository。
 * INPUT: ProviderProfileInput，包含非敏感 config、可选 secretRefs、可选 write-only secretValues。
 * OUTPUT: 保存后的 ProviderProfile，不包含 secret values。
 * SIDE EFFECT: 写入 secret storage 与 provider profile repository。
 * FAILURE: provider 不存在、family mismatch、secret 写入、provider validation 或 repository save 失败时返回 CommandResult error，并尽力删除本次新写入的 secrets。
 */
export async function saveProviderProfile(input: ProviderProfileInput): Promise<CommandResult<ProviderProfile>> {
  const runtime = getRuntime();
  const providerId = normalizeProviderId(input);
  const provider = runtime.providerRegistry.get(providerId);
  if (!provider) {
    return {
      ok: false,
      error: createValidationError(`Provider implementation "${providerId}" not found.`, { providerId }),
    };
  }
  if (provider.family !== input.family) {
    return {
      ok: false,
      error: createValidationError(
        `Provider profile family mismatch: input expects "${input.family}" but provider "${providerId}" is "${provider.family}".`,
        { profileId: input.profileId, providerId, expectedFamily: input.family, actualFamily: provider.family },
      ),
    };
  }

  const now = new Date().toISOString();
  const existing = await getProviderProfileRepository().get(input.profileId);
  const secretRefs: Record<string, string> = { ...(input.secretRefs ?? {}) };
  const writtenSecretRefs: string[] = [];

  try {
    const secretStorage = getSecretStorageAdapter();
    for (const [name, value] of Object.entries(input.secretValues ?? {})) {
      const ref = secretRefs[name] ?? createSecretRef(input.profileId, name);
      await secretStorage.setSecret(ref, value);
      secretRefs[name] = ref;
      writtenSecretRefs.push(ref);
    }

    const profile: ProviderProfile = {
      profileId: input.profileId,
      providerId,
      family: input.family,
      displayName: input.displayName,
      enabled: input.enabled ?? existing?.enabled ?? true,
      config: input.config,
      ...(Object.keys(secretRefs).length > 0 ? { secretRefs } : {}),
      ...(input.models ? { models: input.models } : existing?.models ? { models: existing.models } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const resolvedSecrets: Record<string, string> = {};
    for (const [name, ref] of Object.entries(profile.secretRefs ?? {})) {
      const value = await secretStorage.getSecret(ref);
      if (value === undefined) {
        throw new Error(`Provider profile secret is missing: ${name}`);
      }
      resolvedSecrets[name] = value;
    }

    provider.validateConfig({
      providerId: profile.profileId,
      displayName: profile.displayName,
      family: profile.family,
      ...profile.config,
      ...resolvedSecrets,
    });

    await getProviderProfileRepository().save(profile);
    return { ok: true, value: sanitizeProfile(profile) };
  } catch (error) {
    await Promise.allSettled(writtenSecretRefs.map((ref) => getSecretStorageAdapter().deleteSecret(ref)));
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Invalid provider profile "${input.profileId}".`), {
        profileId: input.profileId,
        providerId,
      }),
    };
  }
}

/** 删除 provider profile，默认同时删除 associated secrets。 */
export async function deleteProviderProfile(
  profileId: string,
  options: DeleteProviderProfileOptions = {},
): Promise<CommandResult<void>> {
  const repository = getProviderProfileRepository();
  const profile = await repository.get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }

  try {
    await repository.delete(profileId);
    if (options.retainSecrets !== true) {
      await Promise.all(
        Object.values(profile.secretRefs ?? {}).map((ref) => getSecretStorageAdapter().deleteSecret(ref)),
      );
    }
    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: createRuntimeError(errorMessage(error, `Failed to delete provider profile "${profileId}".`), {
        profileId,
      }),
    };
  }
}

/** 校验 provider profile 能否解析为 provider runtime config，不返回 secret-bearing config。 */
export async function testProviderProfile(profileId: string): Promise<CommandResult<ProviderProfileTestResult>> {
  try {
    const resolved = await getProviderConfigResolver().resolve(profileId);
    const profile = await getProviderProfileRepository().get(profileId);
    if (!profile) {
      return {
        ok: false,
        error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
      };
    }
    return {
      ok: true,
      value: {
        profileId,
        providerId: profile.providerId,
        family: resolved.family,
        valid: true,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Provider profile "${profileId}" validation failed.`), {
        profileId,
      }),
    };
  }
}

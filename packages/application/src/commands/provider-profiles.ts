import { createRuntimeError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  getProviderConfigResolver,
  getProviderProfileRepository,
  getRuntime,
  getSecretStorageAdapter,
  getRuntimeLogger,
} from '../runtime.js';
import type {
  CommandResult,
  DeleteProviderProfileOptions,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileInput,
  ProviderProfileTestResult,
  TestProviderProfileOptions,
} from './types.js';
import { resolveSecretValue } from './secret-utils.js';
import type { ProviderProfileConfigValue } from './types.js';
import {
  catalogProviderIdForApiFormat,
  normalizeProfileApiConfig,
  providerImplementationIdForApiFormat,
  resolveProfileApiFormat,
} from './api-format-profile.js';
import {
  describeConfiguredCatalogModel,
  providerUsesImageModelCatalog,
  type ProviderModelInfo,
} from '@imagen-ps/providers';
import { invalidateProfileBillingState } from './profile-billing.js';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createSecretRef(profileId: string, secretName: string): string {
  return `secret:provider-profile:${profileId}:${secretName}`;
}

function sanitizeProfile(profile: ProviderProfile): ProviderProfile {
  return { ...profile };
}

function isLegacyPromptOptimizerProfile(profile: ProviderProfile): boolean {
  const legacyApiFormat = (profile as { readonly apiFormat?: unknown }).apiFormat;
  return profile.profileId === '__prompt-optimizer__'
    || legacyApiFormat === 'prompt-optimize'
    || profile.displayName === 'Prompt Optimizer';
}

function stripSecretConfigFields(
  config: Record<string, unknown>,
  secretRefs: Readonly<Record<string, string>> | undefined,
): Record<string, ProviderProfileConfigValue> {
  const next = { ...config };
  delete next.providerId;
  delete next.family;
  for (const name of Object.keys(secretRefs ?? {})) {
    delete next[name];
  }
  return next as Record<string, ProviderProfileConfigValue>;
}

function sanitizeBillingConfig(
  config: Record<string, unknown>,
  secretRefs: Readonly<Record<string, string>> | undefined,
): Record<string, unknown> {
  const billing = config.billing;
  if (typeof billing !== 'object' || billing === null || Array.isArray(billing)) {
    return config;
  }
  const record = billing as Record<string, unknown>;
  if (record.mode !== 'new-api') {
    return config;
  }
  return {
    ...config,
    billing: {
      ...record,
      accessTokenSecretRef:
        typeof secretRefs?.billingAccessToken === 'string' && secretRefs.billingAccessToken.length > 0
          ? secretRefs.billingAccessToken
          : undefined,
    },
  };
}

function mergeProfileConfig(
  existing: Readonly<Record<string, unknown>> | undefined,
  incoming: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    ...(incoming ?? {}),
  };
}

function normalizeAlias(displayName: string): string {
  return displayName.trim();
}

function configuredDefaultModel(profile: ProviderProfile): string {
  const value = profile.config.defaultModel;
  return typeof value === 'string' ? value.trim() : '';
}

function connectivityModelsForProfile(
  profile: ProviderProfile,
  models: readonly ProviderModelInfo[],
): readonly ProviderModelInfo[] {
  const configured = configuredDefaultModel(profile);
  if (configured.length === 0 || models.some((model) => model.id === configured)) {
    return models;
  }
  const catalogProviderId = catalogProviderIdForApiFormat(profile.apiFormat);
  if (!providerUsesImageModelCatalog(catalogProviderId)) {
    return [{ id: configured, displayName: configured }, ...models];
  }
  return [
    describeConfiguredCatalogModel({
      providerId: catalogProviderId,
      modelId: configured,
      discoveredModels: models,
    }),
    ...models,
  ];
}

/** 列出已保存的 provider profiles，不返回 secret values。 */
export async function listProviderProfiles(): Promise<CommandResult<readonly ProviderProfile[]>> {
  const logger = getRuntimeLogger().child({ trace_id: generateTraceId(), package: 'application', component: 'command' });
  const span = logger.startSpan('command.profile.list');
  try {
    const repository = getProviderProfileRepository();
    const profiles = await repository.list();
    const legacyProfiles = profiles.filter(isLegacyPromptOptimizerProfile);
    if (legacyProfiles.length > 0) {
      await Promise.allSettled(legacyProfiles.map((profile) => repository.delete(profile.profileId)));
      await Promise.allSettled(
        legacyProfiles.flatMap((profile) => Object.values(profile.secretRefs ?? {}).map((ref) => getSecretStorageAdapter().deleteSecret(ref))),
      );
      legacyProfiles.forEach((profile) => invalidateProfileBillingState(profile.profileId));
    }
    const visibleProfiles = profiles.filter((profile) => !isLegacyPromptOptimizerProfile(profile));
    span.finish({ count: visibleProfiles.length, cleanedLegacyCount: legacyProfiles.length });
    return { ok: true, value: visibleProfiles.map(sanitizeProfile) };
  } catch (error) {
    span.fail(error);
    return { ok: false, error: createRuntimeError(errorMessage(error, 'Failed to list provider profiles.'), {}) };
  }
}

/** 获取单个 provider profile，不存在时返回 validation error。 */
export async function getProviderProfile(profileId: string): Promise<CommandResult<ProviderProfile>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.profile.get');
  try {
    const profile = await getProviderProfileRepository().get(profileId);
    if (!profile) {
      span.fail({ message: `Provider profile "${profileId}" not found.` });
      return {
        ok: false,
        error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
      };
    }
    span.finish();
    return { ok: true, value: sanitizeProfile(profile) };
  } catch (error) {
    span.fail(error);
    return { ok: false, error: createRuntimeError(errorMessage(error, `Failed to get provider profile "${profileId}".`), { profileId }) };
  }
}

/**
 * 保存 provider profile。
 *
 * INTENT: 将 write-only secretValues 写入 SecretStorageAdapter，并只把 sanitized profile 保存到 repository。
 * INPUT: ProviderProfileInput，包含非敏感 config、可选 secretRefs、可选 write-only secretValues。
 * OUTPUT: 保存后的 ProviderProfile，不包含 secret values。
 * SIDE EFFECT: 写入 secret storage 与 provider profile repository。
 * FAILURE: apiFormat 不支持、secret 写入、provider validation 或 repository save 失败时返回 CommandResult error，并尽力删除本次新写入的 secrets。
 */
export async function saveProviderProfile(input: ProviderProfileInput): Promise<CommandResult<ProviderProfile>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: input.profileId,
  });
  const span = logger.startSpan('command.profile.save');

  if (typeof input.profileId !== 'string' || input.profileId.trim().length === 0) {
    span.fail({ message: 'Provider profile requires profileId.' });
    return {
      ok: false,
      error: createValidationError('Provider profile requires profileId.', {}),
    };
  }

  const existing = await getProviderProfileRepository().get(input.profileId);

  const mergedConfigForApiFormat = mergeProfileConfig(existing?.config, input.config) as ProviderProfileConfig;
  const apiFormat = resolveProfileApiFormat({
    profileId: input.profileId,
    existing,
    incomingApiFormat: input.apiFormat,
    config: mergedConfigForApiFormat,
  });
  const implementationId = providerImplementationIdForApiFormat(apiFormat);
  const provider = getRuntime().providerRegistry.getByApiFormat(apiFormat);
  if (!provider) {
    span.fail({ message: `Provider implementation for apiFormat "${apiFormat}" not found.` });
    return {
      ok: false,
      error: createValidationError(`Provider implementation for apiFormat "${apiFormat}" not found.`, { apiFormat }),
    };
  }

  if (existing && existing.apiFormat !== apiFormat) {
    span.fail({
      message: `Provider profile "${input.profileId}" already uses apiFormat "${existing.apiFormat}" and cannot be saved as apiFormat "${apiFormat}".`,
    });
    return {
      ok: false,
      error: createValidationError(
        `Provider profile "${input.profileId}" already uses apiFormat "${existing.apiFormat}" and cannot be saved as apiFormat "${apiFormat}". Delete it first or use a different profileId.`,
        { profileId: input.profileId, existingApiFormat: existing.apiFormat, apiFormat },
      ),
    };
  }

  const nextDisplayName = normalizeAlias(input.displayName ?? existing?.displayName ?? provider.describe().displayName);
  if (nextDisplayName.length === 0) {
    span.fail({ message: `Provider profile "${input.profileId}" requires displayName.` });
    return {
      ok: false,
      error: createValidationError(`Provider profile "${input.profileId}" requires displayName.`, {
        profileId: input.profileId,
      }),
    };
  }

  const profiles = await getProviderProfileRepository().list();
  const aliasOwner = profiles.find(
    (profile) => profile.profileId !== input.profileId && normalizeAlias(profile.displayName) === nextDisplayName,
  );
  if (aliasOwner) {
    span.fail({ message: `Provider profile displayName "${nextDisplayName}" already exists.` });
    return {
      ok: false,
      error: createValidationError(`Provider profile displayName "${nextDisplayName}" already exists.`, {
        profileId: input.profileId,
        displayName: nextDisplayName,
        existingProfileId: aliasOwner.profileId,
      }),
    };
  }

  const now = new Date().toISOString();
  const incomingSecretNames = new Set(Object.keys(input.secretValues ?? {}));
  const removedSecretNames = new Set(input.removedSecretNames ?? []);
  const secretRefs: Record<string, string> = { ...(existing?.secretRefs ?? {}), ...(input.secretRefs ?? {}) };
  const removedSecretRefs = new Set<string>();
  for (const name of removedSecretNames) {
    if (incomingSecretNames.has(name)) {
      continue;
    }
    const ref = secretRefs[name];
    if (typeof ref === 'string' && ref.length > 0) {
      removedSecretRefs.add(ref);
      delete secretRefs[name];
    }
  }
  const writtenSecrets = new Map<string, string | undefined>();

  try {
    const secretStorage = getSecretStorageAdapter();
    for (const [name, value] of Object.entries(input.secretValues ?? {})) {
      const ref = secretRefs[name] ?? createSecretRef(input.profileId, name);
      if (!writtenSecrets.has(ref)) {
        writtenSecrets.set(ref, await secretStorage.getSecret(ref));
      }
      await secretStorage.setSecret(ref, value);
      secretRefs[name] = ref;
    }

    const nextEnabled = input.enabled ?? existing?.enabled ?? true;
    const displayName = nextDisplayName;
    const mergedConfig = normalizeProfileApiConfig(
      apiFormat,
      sanitizeBillingConfig(mergeProfileConfig(existing?.config, input.config), secretRefs) as ProviderProfileConfig,
    );
    const nextConfig = {
      ...mergedConfig,
      displayName,
      apiFormat,
    };
    const profile: ProviderProfile = {
      profileId: input.profileId,
      apiFormat,
      displayName,
      enabled: nextEnabled,
      config: nextConfig,
      ...(Object.keys(secretRefs).length > 0 ? { secretRefs } : {}),
      // `models` 字段不接受 input 提供（ProviderProfileInput 已删除该字段）；
      // 保留 existing.models 透传，确保 discovery 缓存不被 save 路径擦除。
      ...(existing?.models ? { models: existing.models } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const resolvedSecrets: Record<string, string> = {};
    for (const [name, ref] of Object.entries(profile.secretRefs ?? {})) {
      const value = await secretStorage.getSecret(ref);
      if (value === undefined) {
        throw new Error(`Provider profile secret is missing: ${name}`);
      }
      resolvedSecrets[name] = resolveSecretValue(value);
    }

    const validatedConfig = provider.validateConfig({
      providerId: implementationId,
      displayName: profile.displayName,
      apiFormat,
      family: provider.family,
      ...profile.config,
      ...resolvedSecrets,
    });

    const persistedConfig = stripSecretConfigFields(
      validatedConfig as unknown as Record<string, unknown>,
      profile.secretRefs,
    );

    const persistedProfile: ProviderProfile = {
      ...profile,
      config: persistedConfig,
    };

    await getProviderProfileRepository().save(persistedProfile);
    await Promise.allSettled(Array.from(removedSecretRefs, (ref) => secretStorage.deleteSecret(ref)));
    invalidateProfileBillingState(persistedProfile.profileId);
    span.finish({ apiFormat: profile.apiFormat, displayName: profile.displayName });
    return { ok: true, value: sanitizeProfile(persistedProfile) };
  } catch (error) {
    await Promise.allSettled(
      Array.from(writtenSecrets.entries()).map(([ref, previous]) =>
        previous === undefined
          ? getSecretStorageAdapter().deleteSecret(ref)
          : getSecretStorageAdapter().setSecret(ref, previous),
      ),
    );
    span.fail(error);
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Invalid provider profile "${input.profileId}".`), {
        profileId: input.profileId,
        apiFormat,
      }),
    };
  }
}

/** 删除 provider profile，默认同时删除 associated secrets。 */
export async function deleteProviderProfile(
  profileId: string,
  options: DeleteProviderProfileOptions = {},
): Promise<CommandResult<void>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.profile.delete');
  const repository = getProviderProfileRepository();
  const profile = await repository.get(profileId);
  if (!profile) {
    span.fail({ message: `Provider profile "${profileId}" not found.` });
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
    invalidateProfileBillingState(profileId);
    span.finish({ apiFormat: profile.apiFormat, retainSecrets: options.retainSecrets === true });
    return { ok: true, value: undefined };
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createRuntimeError(errorMessage(error, `Failed to delete provider profile "${profileId}".`), {
        profileId,
      }),
    };
  }
}

/**
 * 分层测试 provider profile，不返回 secret-bearing config。
 *
 * - Layer 1（默认）：config validation —— resolve config + profile lookup。
 * - Layer 2（options.connect）：调 `provider.discoverModels` 测连通性（不花钱）。
 *   discoverModels 抛错或未实现时 `connectivity.reachable = false`。
 * - Layer 3（options.generate）：仅在 connect 成功时，跑最小 text_to_image 烟雾测试（花钱）。
 */
export async function testProviderProfile(
  profileId: string,
  options: TestProviderProfileOptions = {},
): Promise<CommandResult<ProviderProfileTestResult>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.profile.test', { connect: options.connect === true, generate: options.generate === true });

  try {
    const resolved = await getProviderConfigResolver().resolve(profileId);
    const profile = await getProviderProfileRepository().get(profileId);
    if (!profile) {
      span.fail({ message: `Provider profile "${profileId}" not found.` });
      return {
        ok: false,
        error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
      };
    }

    const provider = getRuntime().providerRegistry.getByApiFormat(profile.apiFormat);
    if (!provider) {
      span.fail({ message: `Provider implementation for apiFormat "${profile.apiFormat}" not found.` });
      return {
        ok: false,
        error: createValidationError(`Provider implementation for apiFormat "${profile.apiFormat}" not found.`, {
          profileId,
          apiFormat: profile.apiFormat,
        }),
      };
    }

    const result: {
      profileId: string;
      apiFormat: ProviderProfileTestResult['apiFormat'];
      valid: true;
      connectivity?: ProviderProfileTestResult['connectivity'];
      smokeTest?: ProviderProfileTestResult['smokeTest'];
    } = {
      profileId,
      apiFormat: resolved.apiFormat,
      valid: true,
    };

    // Layer 2：connect
    if (options.connect === true || options.generate === true) {
      if (typeof provider.testConnection === 'function') {
        const tested = await provider.testConnection(resolved.providerConfig);
        if (tested.supported === false) {
          result.connectivity = {
            reachable: false,
            errorMessage: tested.message ?? `Provider implementation for apiFormat "${profile.apiFormat}" does not support connection testing.`,
          };
        } else if (tested.reachable !== true) {
          result.connectivity = {
            reachable: false,
            errorMessage: tested.message ?? `Connection test failed for profile "${profileId}".`,
          };
        } else {
          const connectivityModels = connectivityModelsForProfile(profile, tested.models ?? []);
          const selectableCount = tested.modelCount ?? connectivityModels.filter(
            (model) => model.supportStatus === undefined || model.supportStatus === 'selectable',
          ).length;
          result.connectivity = {
            reachable: true,
            modelCount: selectableCount,
            models: connectivityModels,
          };
        }
      } else if (typeof provider.discoverModels !== 'function') {
        result.connectivity = {
          reachable: false,
          errorMessage: `Provider implementation for apiFormat "${profile.apiFormat}" does not support model discovery.`,
        };
      } else {
        try {
          const models = await provider.discoverModels(resolved.providerConfig);
          const connectivityModels = connectivityModelsForProfile(profile, models);
          const selectableCount = connectivityModels.filter(
            (model) => model.supportStatus === undefined || model.supportStatus === 'selectable',
          ).length;
          result.connectivity = {
            reachable: true,
            modelCount: selectableCount,
            models: connectivityModels,
          };
        } catch (error) {
          result.connectivity = {
            reachable: false,
            errorMessage: errorMessage(error, `Model discovery failed for profile "${profileId}".`),
          };
        }
      }
    }

    // Layer 3：generate（需 connect 成功）
    if (options.generate === true) {
      if (result.connectivity?.reachable !== true) {
        result.smokeTest = { passed: false };
      } else {
        try {
          const request = provider.validateRequest({
            operation: 'text_to_image',
            prompt: 'test',
            output: { count: 1 },
          });
          const invokeResult = await provider.invoke({ config: resolved.providerConfig, request });
          const modelUsed = (resolved.providerConfig as unknown as Record<string, unknown>).defaultModel;
          result.smokeTest = {
            passed: invokeResult.assets.length > 0,
            assetCount: invokeResult.assets.length,
            ...(typeof modelUsed === 'string' ? { modelUsed } : {}),
          };
        } catch {
          result.smokeTest = { passed: false };
        }
      }
    }

    span.finish({
      apiFormat: result.apiFormat,
      ...(result.connectivity ? { reachable: result.connectivity.reachable } : {}),
      ...(result.connectivity?.errorMessage ? { connectivityError: result.connectivity.errorMessage } : {}),
      ...(result.smokeTest ? { smokePassed: result.smokeTest.passed } : {}),
    });
    return { ok: true, value: result };
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createValidationError(errorMessage(error, `Provider profile "${profileId}" validation failed.`), {
        profileId,
      }),
    };
  }
}

import { createRuntimeError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  getProviderConfigResolver,
  getProviderProfileRepository,
  getRuntime,
  getSecretStorageAdapter,
  getRuntimeLogger,
  getUserModelConfigRepository,
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
  normalizeProfileApiConfig,
  providerImplementationIdForApiFormat,
  resolveProfileApiFormat,
} from './api-format-profile.js';
import { invalidateProfileBillingState } from './profile-billing.js';
import { resolveConfiguredModel, toProviderModelExecution, type ResolvedModelConfig } from './model-config-resolution.js';
import { resolveModelGenerationSettingsValue } from './model-generation-preference-resolution.js';
import { getOfficialModelPreset, getRequestStrategy, type ProviderDefaultModelTemplate } from '@imagen-ps/providers';
import type { ContinueProviderProfileSetupInput, ProviderProfileLifecycle, ProviderProfileSetupOutcome, UserModelConfig } from './types.js';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && typeof (error as { readonly message?: unknown }).message === 'string') {
    return (error as { readonly message: string }).message;
  }
  return fallback;
}

/** 将 Provider 的完整默认模板严格投影为 profile-owned 配置。 */
function defaultModelConfigsForProfile(args: {
  readonly profileId: string;
  readonly apiFormat: ProviderProfile['apiFormat'];
  readonly templates: readonly ProviderDefaultModelTemplate[];
}): readonly UserModelConfig[] {
  const modelIds = new Set<string>();
  return args.templates.map((template) => {
    if (
      template.apiFormat !== args.apiFormat ||
      template.modelId.trim().length === 0 ||
      template.wireModelId.trim().length === 0 ||
      template.baseModelId.trim().length === 0 ||
      modelIds.has(template.modelId)
    ) {
      throw new Error('Provider default model template is invalid.');
    }
    modelIds.add(template.modelId);
    const preset = getOfficialModelPreset(args.apiFormat, template.baseModelId);
    const strategy = preset ? getRequestStrategy(preset.requestStrategyId) : undefined;
    if (!preset || !strategy || strategy.apiFormat !== args.apiFormat) {
      throw new Error(`Provider default model template "${template.modelId}" has no matching Official Model Preset.`);
    }
    return {
      profileId: args.profileId,
      apiFormat: args.apiFormat,
      modelId: template.modelId,
      wireModelId: template.wireModelId,
      baseModelId: template.baseModelId,
      requestStrategyId: preset.requestStrategyId,
      outputExposure: preset.outputExposure,
      outputMatrix: preset.outputMatrix,
    };
  });
}

function createSecretRef(profileId: string, secretName: string): string {
  return `secret:provider-profile:${profileId}:${secretName}`;
}

function sanitizeProfile(profile: ProviderProfile): ProviderProfile {
  const {
    defaultModelId: _defaultModelId,
    selectedModelIds: _selectedModelIds,
    enabled: _enabled,
    ...sanitized
  } = profile as ProviderProfile & { readonly enabled?: unknown } & {
    readonly defaultModelId?: unknown;
    readonly selectedModelIds?: unknown;
  };
  return {
    ...sanitized,
    lifecycle: profile.lifecycle === 'setup' ? 'setup' : 'ready',
  };
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
  delete next.defaultModel;
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
  if (record.source !== 'billing-token') {
    return config;
  }
  return {
    ...config,
    billing: {
      ...record,
      tokenSecretRef:
        typeof secretRefs?.billingToken === 'string' && secretRefs.billingToken.length > 0
          ? secretRefs.billingToken
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

function normalizeSystemInstruction(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function resolveSystemInstruction(input: ProviderProfileInput, existing: ProviderProfile | undefined): string | undefined {
  if (Object.prototype.hasOwnProperty.call(input, 'systemInstruction')) {
    return normalizeSystemInstruction(input.systemInstruction);
  }
  return normalizeSystemInstruction(existing?.systemInstruction);
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
    const visibleProfiles = profiles
      .map(sanitizeProfile)
      .filter((profile) => !isLegacyPromptOptimizerProfile(profile) && profile.lifecycle === 'ready');
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
    const stored = await getProviderProfileRepository().get(profileId);
    const profile = stored === undefined ? undefined : sanitizeProfile(stored);
    if (!profile || profile.lifecycle !== 'ready') {
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
async function saveProviderProfileWithLifecycle(
  input: ProviderProfileInput,
  requestedLifecycle?: ProviderProfileLifecycle,
): Promise<CommandResult<ProviderProfile>> {
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

  const storedExisting = await getProviderProfileRepository().get(input.profileId);
  const existing = storedExisting === undefined ? undefined : sanitizeProfile(storedExisting);

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

    const displayName = nextDisplayName;
    const systemInstruction = resolveSystemInstruction(input, existing);
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
      ...(systemInstruction ? { systemInstruction } : {}),
      lifecycle: requestedLifecycle ?? existing?.lifecycle ?? 'ready',
      config: nextConfig,
      ...(Object.keys(secretRefs).length > 0 ? { secretRefs } : {}),
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

/** 保存已完成 Profile 的合法编辑；创建路由使用内部 setup orchestration。 */
export async function saveProviderProfile(input: ProviderProfileInput): Promise<CommandResult<ProviderProfile>> {
  return saveProviderProfileWithLifecycle(input);
}

/** 创建流程专用读取；setup Profile 不经过公开 Profile 查询。 */
export async function getProviderSetupProfile(profileId: string): Promise<CommandResult<ProviderProfile>> {
  const profile = await getProviderProfileRepository().get(profileId);
  if (!profile) {
    return { ok: false, error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }) };
  }
  const sanitized = sanitizeProfile(profile);
  if (sanitized.lifecycle !== 'setup') {
    return { ok: false, error: createValidationError(`Provider profile "${profileId}" is not in setup.`, { profileId }) };
  }
  return { ok: true, value: sanitized };
}

/** 首个已保存 model config 让 setup Profile 成为唯一可公开的 ready Profile。 */
export async function promoteProviderProfileSetup(profileId: string): Promise<CommandResult<ProviderProfile>> {
  try {
    const repository = getProviderProfileRepository();
    const stored = await repository.get(profileId);
    if (!stored) {
      return { ok: false, error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }) };
    }
    const profile = sanitizeProfile(stored);
    if (profile.lifecycle === 'ready') {
      return { ok: true, value: profile };
    }
    const configs = await getUserModelConfigRepository().list(profileId);
    if (configs.length === 0) {
      return {
        ok: false,
        error: createValidationError('Provider profile setup requires at least one model config.', { profileId }),
      };
    }
    const ready: ProviderProfile = { ...profile, lifecycle: 'ready', updatedAt: new Date().toISOString() };
    await repository.save(ready);
    return { ok: true, value: sanitizeProfile(ready) };
  } catch (error) {
    return {
      ok: false,
      error: createRuntimeError(errorMessage(error, `Failed to promote provider profile "${profileId}".`), { profileId }),
    };
  }
}

/** 取消或启动恢复时只清理内部 setup 数据及其 secrets。 */
export async function cancelProviderProfileSetup(profileId: string): Promise<CommandResult<void>> {
  try {
    const repository = getProviderProfileRepository();
    const stored = await repository.get(profileId);
    if (!stored) return { ok: true, value: undefined };
    const profile = sanitizeProfile(stored);
    if (profile.lifecycle !== 'setup') {
      return {
        ok: false,
        error: createValidationError(`Provider profile "${profileId}" is ready and cannot be cancelled as setup.`, { profileId }),
      };
    }
    await repository.delete(profileId);
    await getUserModelConfigRepository().deleteProfile(profileId);
    await Promise.all(Object.values(profile.secretRefs ?? {}).map((ref) => getSecretStorageAdapter().deleteSecret(ref)));
    invalidateProfileBillingState(profileId);
    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: createRuntimeError(errorMessage(error, `Failed to cancel provider profile setup "${profileId}".`), { profileId }),
    };
  }
}

/** 宿主启动时删除上次中断遗留的 setup Profile；重复执行安全。 */
export async function recoverProviderProfileSetups(): Promise<CommandResult<readonly string[]>> {
  try {
    const profiles = await getProviderProfileRepository().list();
    const setupIds = profiles
      .map(sanitizeProfile)
      .filter((profile) => profile.lifecycle === 'setup')
      .map((profile) => profile.profileId);
    for (const profileId of setupIds) {
      const result = await cancelProviderProfileSetup(profileId);
      if (!result.ok) return result;
    }
    return { ok: true, value: setupIds };
  } catch (error) {
    return { ok: false, error: createRuntimeError(errorMessage(error, 'Failed to recover provider profile setup.'), {}) };
  }
}

/** 创建 Profile 的单一 application orchestration；UI 只消费 outcome 路由。 */
export async function continueProviderProfileSetup(
  input: ContinueProviderProfileSetupInput,
): Promise<CommandResult<ProviderProfileSetupOutcome>> {
  const existing = await getProviderProfileRepository().get(input.profile.profileId);
  if (existing && sanitizeProfile(existing).lifecycle === 'ready') {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${input.profile.profileId}" is already ready.`, { profileId: input.profile.profileId }),
    };
  }
  const saved = await saveProviderProfileWithLifecycle(input.profile, 'setup');
  if (!saved.ok) return { ok: false, error: saved.error };

  const profile = saved.value;
  const provider = getRuntime().providerRegistry.getByApiFormat(profile.apiFormat);
  if (!provider) {
    return {
      ok: false,
      error: createValidationError(`Provider implementation for apiFormat "${profile.apiFormat}" not found.`, { apiFormat: profile.apiFormat }),
    };
  }
  const modelRepository = getUserModelConfigRepository();
  const existingModels = await modelRepository.list(profile.profileId);
  if (existingModels.length > 0) {
    const promoted = await promoteProviderProfileSetup(profile.profileId);
    return promoted.ok
      ? { ok: true, value: { kind: 'ready', profile: promoted.value } }
      : { ok: false, error: promoted.error };
  }

  const templates = provider.describe().defaultModelTemplates;
  if (templates.length > 0) {
    try {
      const configs = defaultModelConfigsForProfile({
        profileId: profile.profileId,
        apiFormat: profile.apiFormat,
        templates,
      });
      await modelRepository.initializeProfile(profile.profileId, configs);
      const promoted = await promoteProviderProfileSetup(profile.profileId);
      return promoted.ok
        ? { ok: true, value: { kind: 'ready', profile: promoted.value } }
        : { ok: false, error: promoted.error };
    } catch (error) {
      return {
        ok: false,
        error: createValidationError(errorMessage(error, 'Failed to initialize provider default models.'), {
          profileId: profile.profileId,
          apiFormat: profile.apiFormat,
        }),
      };
    }
  }

  const wireModelId = input.wireModelId?.trim();
  if (!wireModelId) {
    return { ok: true, value: { kind: 'profile-models', profileId: profile.profileId, apiFormat: profile.apiFormat } };
  }

  const preset = getOfficialModelPreset(profile.apiFormat, wireModelId);
  if (!preset) {
    return {
      ok: true,
      value: { kind: 'model-configuration', profileId: profile.profileId, apiFormat: profile.apiFormat, wireModelId },
    };
  }

  const config: UserModelConfig = {
    profileId: profile.profileId,
    apiFormat: profile.apiFormat,
    modelId: preset.modelId,
    baseModelId: preset.modelId,
    wireModelId,
    requestStrategyId: preset.requestStrategyId,
    outputExposure: preset.outputExposure,
    outputMatrix: preset.outputMatrix,
  };
  await modelRepository.save(config);
  const promoted = await promoteProviderProfileSetup(profile.profileId);
  return promoted.ok
    ? { ok: true, value: { kind: 'ready', profile: promoted.value } }
    : { ok: false, error: promoted.error };
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
    await getUserModelConfigRepository().deleteProfile(profileId);
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

async function resolveConfiguredProfileModel(profile: ProviderProfile, modelId: string | undefined): Promise<ResolvedModelConfig | undefined> {
  const normalizedModelId = modelId?.trim();
  if (!normalizedModelId) return undefined;
  return resolveConfiguredModel({
    profileId: profile.profileId,
    apiFormat: profile.apiFormat,
    modelId: normalizedModelId,
    userModelConfigRepository: getUserModelConfigRepository(),
  });
}

/**
 * 分层测试 provider profile，不返回 secret-bearing config。
 *
 * - Layer 1（默认）：config validation —— resolve config + profile lookup。
 * - Layer 2（options.connect）：调 provider 无生成连接验证（不花钱）。
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
      if (typeof provider.safeProbe === 'function') {
        const resolvedProbeModel = await resolveConfiguredProfileModel(profile, options.modelId);
        if (!resolvedProbeModel) {
          throw createValidationError('Provider profile test requires modelId.', { profileId, modelId: options.modelId });
        }
        const tested = await provider.safeProbe(
          resolved.providerConfig,
          { modelId: resolvedProbeModel?.wireModelId },
        );
        result.connectivity = {
          status: tested.status,
          ...(tested.message ? { message: tested.message } : {}),
        };
      } else {
        result.connectivity = {
          status: 'partial',
          message: `Provider implementation for apiFormat "${profile.apiFormat}" does not support safe non-generation verification.`,
        };
      }
    }

    // Layer 3：generate（需 connect 成功）
    if (options.generate === true) {
      if (result.connectivity?.status !== 'verified') {
        result.smokeTest = { passed: false };
      } else {
        try {
          const resolvedModel = await resolveConfiguredProfileModel(profile, options.modelId);
          if (!resolvedModel) {
            result.smokeTest = { passed: false };
          } else {
            const generationSettings = resolveModelGenerationSettingsValue({
              key: {
                profileId: profile.profileId,
                apiFormat: profile.apiFormat,
                modelId: resolvedModel.configModelId,
                operation: 'text_to_image',
              },
              userConfig: resolvedModel.source === 'user' ? resolvedModel : undefined,
            });
            const request = provider.validateRequest({
              operation: 'text_to_image',
              prompt: 'test',
              model: toProviderModelExecution(resolvedModel),
              capabilityModelId: resolvedModel.capabilityModelId,
              output: { count: 1, selection: generationSettings.selection.effectiveSelection },
            });
            const invokeResult = await provider.invoke({ config: resolved.providerConfig, request });
            const modelUsed = resolvedModel.wireModelId;
            result.smokeTest = {
              passed: invokeResult.assets.length > 0,
              assetCount: invokeResult.assets.length,
              ...(typeof modelUsed === 'string' ? { modelUsed } : {}),
            };
          }
        } catch {
          result.smokeTest = { passed: false };
        }
      }
    }

    span.finish({
      apiFormat: result.apiFormat,
      ...(result.connectivity ? { connectivityStatus: result.connectivity.status } : {}),
      ...(result.connectivity?.message ? { connectivityMessage: result.connectivity.message } : {}),
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

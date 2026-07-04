/**
 * Prompt Optimizer 相关命令。
 *
 * 提供唯一内置 Prompt Optimizer Profile 的初始化、验证与执行能力。
 * 底层复用现有 profile dispatch 与 provider 请求链路，不引入新 workflow。
 */

import { createProviderError, createRuntimeError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  DEFAULT_OPTIMIZER_INSTRUCTION,
  parsePromptOptimizeResponse,
} from '@imagen-ps/providers';
import {
  getRuntime,
  getRuntimeLogger,
  getProviderProfileRepository,
  getSecretStorageAdapter,
} from '../runtime.js';
import type { CommandResult, ProviderProfile, ProviderProfileConfig, ProviderProfileInput } from './types.js';
import { resolveSecretValue } from './secret-utils.js';

/** 系统内置、唯一、不可删除的 Prompt Optimizer Profile ID。 */
export const PROMPT_OPTIMIZER_PROFILE_ID = '__prompt-optimizer__';

/** 优化命令的输入。 */
export interface OptimizePromptInput {
  readonly prompt: string;
}

/** 默认验证 prompt。 */
const DEFAULT_TEST_PROMPT = 'test';

let optimizeInFlight: Promise<unknown> | null = null;

interface PromptOptimizerSettings {
  readonly enabled: boolean;
  readonly displayName: string;
  readonly connection: {
    readonly selectionMode: 'manual';
    readonly selectedEndpointId: string;
    readonly endpoints: readonly { readonly id: string; readonly url: string; readonly enabled: boolean }[];
  };
  readonly defaultModel: string;
  readonly instruction: string;
  readonly testPrompt: string;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function defaultPromptOptimizerSettings(): PromptOptimizerSettings {
  const now = new Date().toISOString();
  return {
    enabled: false,
    displayName: 'Prompt Optimizer',
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [{
        id: 'primary',
        url: 'https://openrouter.ai/api/v1',
        enabled: true,
      }],
    },
    defaultModel: '',
    instruction: DEFAULT_OPTIMIZER_INSTRUCTION,
    testPrompt: DEFAULT_TEST_PROMPT,
    createdAt: now,
    updatedAt: now,
  };
}

function profileFromPromptOptimizerSettings(settings: PromptOptimizerSettings): ProviderProfile {
  return {
    profileId: PROMPT_OPTIMIZER_PROFILE_ID,
    apiFormat: 'openai-chat-completions',
    displayName: settings.displayName,
    enabled: settings.enabled,
    config: {
      apiFormat: 'openai-chat-completions',
      displayName: settings.displayName,
      connection: settings.connection,
      paths: { invoke: '/chat/completions' },
      defaultModel: settings.defaultModel,
      instruction: settings.instruction,
      testPrompt: settings.testPrompt,
    },
    ...(settings.secretRefs ? { secretRefs: settings.secretRefs } : {}),
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

function settingsFromPromptOptimizerProfile(profile: ProviderProfile): PromptOptimizerSettings {
  const config = profile.config as ProviderProfileConfig;
  const connection = typeof config.connection === 'object' && config.connection !== null && !Array.isArray(config.connection)
    ? config.connection as PromptOptimizerSettings['connection']
    : defaultPromptOptimizerSettings().connection;
  const defaultSettings = defaultPromptOptimizerSettings();
  return {
    enabled: profile.enabled,
    displayName: profile.displayName,
    connection,
    defaultModel: typeof config.defaultModel === 'string' ? config.defaultModel : '',
    instruction: typeof config.instruction === 'string' && config.instruction.trim().length > 0
      ? config.instruction
      : DEFAULT_OPTIMIZER_INSTRUCTION,
    testPrompt: typeof config.testPrompt === 'string' && config.testPrompt.trim().length > 0
      ? config.testPrompt
      : DEFAULT_TEST_PROMPT,
    ...(profile.secretRefs ? { secretRefs: profile.secretRefs } : {}),
    createdAt: profile.createdAt ?? defaultSettings.createdAt,
    updatedAt: profile.updatedAt ?? defaultSettings.updatedAt,
  };
}

async function loadPromptOptimizerSettings(): Promise<PromptOptimizerSettings | undefined> {
  const profile = await getProviderProfileRepository().get(PROMPT_OPTIMIZER_PROFILE_ID);
  return profile ? settingsFromPromptOptimizerProfile(profile) : undefined;
}

async function savePromptOptimizerSettings(settings: PromptOptimizerSettings): Promise<ProviderProfile> {
  const profile = profileFromPromptOptimizerSettings(settings);
  await getProviderProfileRepository().save(profile);
  return profile;
}

function mergePromptOptimizerSettings(
  existing: PromptOptimizerSettings,
  input: ProviderProfileInput,
): PromptOptimizerSettings {
  const config = input.config ?? {};
  const connection = typeof config.connection === 'object' && config.connection !== null && !Array.isArray(config.connection)
    ? config.connection as PromptOptimizerSettings['connection']
    : existing.connection;
  const now = new Date().toISOString();
  return {
    ...existing,
    enabled: input.enabled ?? existing.enabled,
    displayName: input.displayName ?? existing.displayName,
    connection,
    defaultModel: typeof config.defaultModel === 'string' ? config.defaultModel : existing.defaultModel,
    instruction: typeof config.instruction === 'string' && config.instruction.trim().length > 0
      ? config.instruction
      : existing.instruction,
    testPrompt: typeof config.testPrompt === 'string' && config.testPrompt.trim().length > 0
      ? config.testPrompt
      : existing.testPrompt,
    secretRefs: input.secretRefs ?? existing.secretRefs,
    updatedAt: now,
  };
}

async function resolvePromptOptimizerConfig(settings: PromptOptimizerSettings): Promise<unknown> {
  const provider = getRuntime().providerRegistry.get('prompt-optimize');
  if (!provider) {
    throw new Error('Prompt Optimizer provider implementation not found.');
  }
  const rawKey = settings.secretRefs?.apiKey
    ? await getSecretStorageAdapter().getSecret(settings.secretRefs.apiKey)
    : undefined;
  if (rawKey === undefined) {
    throw new Error('Prompt Optimizer apiKey secret is missing.');
  }
  return provider.validateConfig({
    providerId: 'prompt-optimize',
    displayName: settings.displayName,
    family: 'prompt-optimize',
    connection: settings.connection,
    apiKey: resolveSecretValue(rawKey),
    defaultModel: settings.defaultModel,
    instruction: settings.instruction,
    testPrompt: settings.testPrompt,
  });
}

/**
 * 确保内置 Prompt Optimizer Profile 存在；不存在则用默认 instruction 创建。
 *
 * 已存在时不做任何修改，保留用户配置。
 */
export async function ensurePromptOptimizerProfile(): Promise<CommandResult<ProviderProfile>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: PROMPT_OPTIMIZER_PROFILE_ID,
  });
  const span = logger.startSpan('command.prompt_optimizer.ensure');

  try {
    const existing = await loadPromptOptimizerSettings();
    if (existing) {
      span.finish({ created: false });
      return { ok: true, value: profileFromPromptOptimizerSettings(existing) };
    }

    const settings = defaultPromptOptimizerSettings();
    const profile = await savePromptOptimizerSettings(settings);
    span.finish({ created: true });
    return { ok: true, value: profile };
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createRuntimeError(errorMessage(error, 'Failed to ensure Prompt Optimizer profile.'), {
        profileId: PROMPT_OPTIMIZER_PROFILE_ID,
      }),
    };
  }
}

/**
 * 执行一次 prompt 优化，返回优化后的文本。
 *
 * 仅当内置 Profile `enabled === true` 且配置有效时可用。
 */
export async function optimizePrompt(input: OptimizePromptInput): Promise<CommandResult<string>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: PROMPT_OPTIMIZER_PROFILE_ID,
  });
  const span = logger.startSpan('command.prompt_optimizer.optimize');

  const prompt = input.prompt.trim();
  if (prompt.length === 0) {
    span.fail({ message: 'Prompt optimization requires non-empty prompt.' });
    return { ok: false, error: createValidationError('Prompt optimization requires non-empty prompt.', {}) };
  }

  if (optimizeInFlight !== null) {
    span.fail({ message: 'Prompt optimization already in progress.' });
    return {
      ok: false,
      error: createValidationError('Prompt optimization already in progress.', {}),
    };
  }

  try {
    const settings = await loadPromptOptimizerSettings();
    if (!settings) {
      span.fail({ message: 'Prompt Optimizer profile not found.' });
      return {
        ok: false,
        error: createValidationError('Prompt Optimizer profile not found.', {
          profileId: PROMPT_OPTIMIZER_PROFILE_ID,
        }),
      };
    }
    if (!settings.enabled) {
      span.fail({ message: 'Prompt Optimizer profile is not enabled. Validate it in Settings first.' });
      return {
        ok: false,
        error: createValidationError('Prompt Optimizer profile is not enabled. Validate it in Settings first.', {
          profileId: PROMPT_OPTIMIZER_PROFILE_ID,
        }),
      };
    }

    const provider = getRuntime().providerRegistry.get('prompt-optimize');
    if (!provider) {
      throw new Error('Prompt Optimizer provider implementation not found.');
    }
    const config = await resolvePromptOptimizerConfig(settings);
    const request = provider.validateRequest({ operation: 'prompt_optimize', prompt });
    const dispatchPromise = provider.invoke({ config: config as never, request: request as never });
    optimizeInFlight = dispatchPromise;

    const result = (await dispatchPromise) as { raw?: unknown } | undefined;
    const raw = result?.raw;
    const optimized = parsePromptOptimizeResponse(raw).trim();

    if (optimized.length === 0) {
      span.fail({ message: 'Prompt optimizer returned empty response.' });
      return {
        ok: false,
        error: createProviderError('Prompt optimizer returned empty response.', {
          profileId: PROMPT_OPTIMIZER_PROFILE_ID,
        }),
      };
    }

    span.finish({ optimizedLength: optimized.length });
    return { ok: true, value: optimized };
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(errorMessage(error, 'Prompt optimization failed.'), {
        profileId: PROMPT_OPTIMIZER_PROFILE_ID,
      }),
    };
  } finally {
    optimizeInFlight = null;
  }
}

/**
 * 验证内置 Prompt Optimizer Profile：发起一次真实优化请求，成功则把 `enabled` 设为 `true`。
 *
 * @returns 验证请求返回的优化文本
 */
export async function validatePromptOptimizerProfile(
  profileId: string,
): Promise<CommandResult<string>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: profileId,
  });
  const span = logger.startSpan('command.prompt_optimizer.validate');

  if (profileId !== PROMPT_OPTIMIZER_PROFILE_ID) {
    span.fail({ message: `Profile "${profileId}" is not the reserved Prompt Optimizer profile.` });
    return {
      ok: false,
      error: createValidationError(`Profile "${profileId}" is not the reserved Prompt Optimizer profile.`, {
        profileId,
      }),
    };
  }

  try {
    const settings = await loadPromptOptimizerSettings();
    if (!settings) {
      span.fail({ message: `Provider profile "${profileId}" not found.` });
      return {
        ok: false,
        error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
      };
    }
    const provider = getRuntime().providerRegistry.get('prompt-optimize');
    if (!provider) {
      throw new Error('Prompt Optimizer provider implementation not found.');
    }
    const config = await resolvePromptOptimizerConfig(settings) as { testPrompt?: string };
    const testPrompt = typeof config.testPrompt === 'string' && config.testPrompt.trim().length > 0
      ? config.testPrompt.trim()
      : DEFAULT_TEST_PROMPT;

    const request = provider.validateRequest({ operation: 'prompt_optimize', prompt: testPrompt });
    const result = await provider.invoke({ config: config as never, request: request as never }) as { raw?: unknown } | undefined;

    const optimized = parsePromptOptimizeResponse(result?.raw).trim();
    if (optimized.length === 0) {
      span.fail({ message: 'Prompt optimizer returned empty response.' });
      return {
        ok: false,
        error: createProviderError('Prompt optimizer returned empty response.', { profileId }),
      };
    }

    await savePromptOptimizerSettings({
      ...settings,
      enabled: true,
      updatedAt: new Date().toISOString(),
    });

    span.finish({ validated: true });
    return { ok: true, value: optimized };
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(
        `Prompt Optimizer validation failed for profile "${profileId}": ${errorMessage(error, 'unknown error')}`,
        {
        profileId,
      }),
    };
  }
}

/** 保存内置 Prompt Optimizer 的 canonical API profile 形状。 */
export async function savePromptOptimizerProfile(input: ProviderProfileInput): Promise<CommandResult<ProviderProfile>> {
  if (input.profileId !== PROMPT_OPTIMIZER_PROFILE_ID) {
    return {
      ok: false,
      error: createValidationError(`Profile "${input.profileId}" is not the reserved Prompt Optimizer profile.`, {
        profileId: input.profileId,
      }),
    };
  }
  if (input.apiFormat !== undefined && input.apiFormat !== 'openai-chat-completions') {
    return {
      ok: false,
      error: createValidationError('Prompt Optimizer profile requires apiFormat "openai-chat-completions".', {
        profileId: input.profileId,
        apiFormat: input.apiFormat,
      }),
    };
  }
  try {
    const existing = await loadPromptOptimizerSettings() ?? defaultPromptOptimizerSettings();
    const secretRefs = { ...(existing.secretRefs ?? {}), ...(input.secretRefs ?? {}) };
    const incomingSecretNames = new Set(Object.keys(input.secretValues ?? {}));
    for (const name of input.removedSecretNames ?? []) {
      if (!incomingSecretNames.has(name)) {
        delete secretRefs[name];
      }
    }
    for (const [name, value] of Object.entries(input.secretValues ?? {})) {
      const ref = secretRefs[name] ?? `secret:provider-profile:${PROMPT_OPTIMIZER_PROFILE_ID}:${name}`;
      await getSecretStorageAdapter().setSecret(ref, value);
      secretRefs[name] = ref;
    }
    const settings = mergePromptOptimizerSettings(existing, {
      ...input,
      secretRefs,
    });
    return { ok: true, value: await savePromptOptimizerSettings(settings) };
  } catch (error) {
    return {
      ok: false,
      error: createValidationError(errorMessage(error, 'Failed to save Prompt Optimizer profile.'), {
        profileId: input.profileId,
      }),
    };
  }
}

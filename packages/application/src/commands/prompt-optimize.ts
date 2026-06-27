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
  getProviderConfigResolver,
  getProviderProfileRepository,
  getRuntime,
  getRuntimeLogger,
} from '../runtime.js';
import type { CommandResult, ProviderProfile } from './types.js';

/** 系统内置、唯一、不可删除的 Prompt Optimizer Profile ID。 */
export const PROMPT_OPTIMIZER_PROFILE_ID = '__prompt-optimizer__';

/** 优化命令的输入。 */
export interface OptimizePromptInput {
  readonly prompt: string;
}

/** 默认验证 prompt。 */
const DEFAULT_TEST_PROMPT = 'test';

let optimizeInFlight: Promise<unknown> | null = null;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isOptimizerProfile(profile: ProviderProfile): boolean {
  return profile.providerId === 'prompt-optimize';
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
    const repository = getProviderProfileRepository();
    const existing = await repository.get(PROMPT_OPTIMIZER_PROFILE_ID);
    if (existing) {
      span.finish({ created: false });
      return { ok: true, value: existing };
    }

    const now = new Date().toISOString();
    const profile: ProviderProfile = {
      profileId: PROMPT_OPTIMIZER_PROFILE_ID,
      providerId: 'prompt-optimize',
      displayName: 'Prompt Optimizer',
      enabled: false,
      config: {
        providerId: 'prompt-optimize',
        displayName: 'Prompt Optimizer',
        family: 'prompt-optimize',
        baseURL: '',
        defaultModel: '',
        instruction: DEFAULT_OPTIMIZER_INSTRUCTION,
        testPrompt: DEFAULT_TEST_PROMPT,
      },
      createdAt: now,
      updatedAt: now,
    };

    await repository.save(profile);
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
    const repository = getProviderProfileRepository();
    const profile = await repository.get(PROMPT_OPTIMIZER_PROFILE_ID);
    if (!profile) {
      span.fail({ message: 'Prompt Optimizer profile not found.' });
      return {
        ok: false,
        error: createValidationError('Prompt Optimizer profile not found.', {
          profileId: PROMPT_OPTIMIZER_PROFILE_ID,
        }),
      };
    }
    if (!isOptimizerProfile(profile)) {
      span.fail({ message: `Profile "${PROMPT_OPTIMIZER_PROFILE_ID}" is not a prompt-optimize profile.` });
      return {
        ok: false,
        error: createValidationError(`Profile "${PROMPT_OPTIMIZER_PROFILE_ID}" is not a prompt-optimize profile.`, {
          profileId: PROMPT_OPTIMIZER_PROFILE_ID,
          providerId: profile.providerId,
        }),
      };
    }
    if (!profile.enabled) {
      span.fail({ message: 'Prompt Optimizer profile is not enabled. Validate it in Settings first.' });
      return {
        ok: false,
        error: createValidationError('Prompt Optimizer profile is not enabled. Validate it in Settings first.', {
          profileId: PROMPT_OPTIMIZER_PROFILE_ID,
        }),
      };
    }

    const dispatchPromise = getRuntime().dispatcher.dispatch({
      provider: 'profile',
      params: {
        profileId: PROMPT_OPTIMIZER_PROFILE_ID,
        request: { operation: 'text_to_image', prompt },
      },
    });
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
    const repository = getProviderProfileRepository();
    const profile = await repository.get(profileId);
    if (!profile) {
      span.fail({ message: `Provider profile "${profileId}" not found.` });
      return {
        ok: false,
        error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
      };
    }
    if (!isOptimizerProfile(profile)) {
      span.fail({ message: `Profile "${profileId}" is not a prompt-optimize profile.` });
      return {
        ok: false,
        error: createValidationError(`Profile "${profileId}" is not a prompt-optimize profile.`, {
          profileId,
          providerId: profile.providerId,
        }),
      };
    }

    const resolved = await getProviderConfigResolver().resolve(profileId);
    const config = resolved.providerConfig as { testPrompt?: string };
    const testPrompt = typeof config.testPrompt === 'string' && config.testPrompt.trim().length > 0
      ? config.testPrompt.trim()
      : DEFAULT_TEST_PROMPT;

    const result = (await getRuntime().dispatcher.dispatch({
      provider: 'profile',
      params: {
        profileId,
        request: { operation: 'text_to_image', prompt: testPrompt },
      },
    })) as { raw?: unknown } | undefined;

    const optimized = parsePromptOptimizeResponse(result?.raw).trim();
    if (optimized.length === 0) {
      span.fail({ message: 'Prompt optimizer returned empty response.' });
      return {
        ok: false,
        error: createProviderError('Prompt optimizer returned empty response.', { profileId }),
      };
    }

    const now = new Date().toISOString();
    const nextProfile: ProviderProfile = {
      ...profile,
      enabled: true,
      updatedAt: now,
    };
    await repository.save(nextProfile);

    span.finish({ validated: true });
    return { ok: true, value: optimized };
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(errorMessage(error, `Prompt Optimizer validation failed for profile "${profileId}".`), {
        profileId,
      }),
    };
  }
}

/**
 * Prompt Optimizer live smoke.
 *
 * 目标：用真实 `.test.env` 凭证验证 Prompt Optimizer 的完整闭环：
 * ensure reserved profile -> save live config -> refresh /models -> validate
 * -> optimize prompt。
 *
 * 该用例默认跳过；仅当 `IMAGEN_RUN_SMOKE=1` 且所需 env 存在时运行。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ensurePromptOptimizerProfile,
  optimizePrompt,
  PROMPT_OPTIMIZER_PROFILE_ID,
  refreshProfileModels,
  saveProviderProfile,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  validatePromptOptimizerProfile,
  type ProviderProfile,
} from '@imagen-ps/application';
import { FileProviderProfileRepository, FileSecretStorageAdapter } from '../../src/adapters/file-provider-profile-adapter.js';

const baseURL = process.env.IMAGEN_SMOKE_PROMPT_OPTIMIZER_BASE_URL ?? process.env.IMAGEN_SMOKE_N1N_BASE_URL;
const apiKey = process.env.IMAGEN_SMOKE_PROMPT_OPTIMIZER_API_KEY ?? process.env.IMAGEN_SMOKE_N1N_API_KEY;
const defaultModel = process.env.IMAGEN_SMOKE_PROMPT_OPTIMIZER_MODEL ?? process.env.IMAGEN_SMOKE_N1N_MODEL ?? 'gpt-4o-mini';

function skipReason(): string | null {
  if (process.env.IMAGEN_RUN_SMOKE !== '1') {
    return 'live disabled (set IMAGEN_RUN_SMOKE=1)';
  }
  if (!baseURL) {
    return 'env missing: IMAGEN_SMOKE_PROMPT_OPTIMIZER_BASE_URL or IMAGEN_SMOKE_N1N_BASE_URL';
  }
  if (!apiKey) {
    return 'env missing: IMAGEN_SMOKE_PROMPT_OPTIMIZER_API_KEY or IMAGEN_SMOKE_N1N_API_KEY';
  }
  return null;
}

const reason = skipReason();
const d = reason ? describe.skip : describe;

d(`prompt optimizer live smoke${reason ? ` — SKIP: ${reason}` : ''}`, () => {
  let configDir = '';

  beforeAll(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagen-prompt-optimizer-smoke-'));
    setProviderProfileRepository(new FileProviderProfileRepository(configDir));
    setSecretStorageAdapter(new FileSecretStorageAdapter(configDir));
  });

  afterAll(() => {
    if (configDir) {
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });

  it('ensures and saves the reserved optimizer profile with live config', async () => {
    const ensured = await ensurePromptOptimizerProfile();
    expect(ensured.ok).toBe(true);
    if (!ensured.ok) {
      return;
    }

    const saved = await saveProviderProfile({
      profileId: PROMPT_OPTIMIZER_PROFILE_ID,
      providerId: 'prompt-optimize',
      displayName: 'Prompt Optimizer',
      enabled: false,
      config: {
        ...(ensured.value.config as ProviderProfile['config']),
        providerId: 'prompt-optimize',
        displayName: 'Prompt Optimizer',
        family: 'prompt-optimize',
        baseURL: baseURL!,
        defaultModel,
        instruction: 'Rewrite the prompt to be clearer and more specific. Return only the rewritten prompt.',
        testPrompt: 'a red square product photo',
      },
      secretValues: {
        apiKey: apiKey!,
      },
    });

    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      return;
    }
    expect(saved.value.profileId).toBe(PROMPT_OPTIMIZER_PROFILE_ID);
    expect(saved.value.providerId).toBe('prompt-optimize');
    expect(saved.value.config.baseURL).toBe(baseURL);
    expect(saved.value.config.defaultModel).toBe(defaultModel);
  });

  it('refreshes available models from the live provider', async () => {
    const refreshed = await refreshProfileModels(PROMPT_OPTIMIZER_PROFILE_ID);
    expect(refreshed.ok, refreshed.ok ? '' : refreshed.error.message).toBe(true);
    if (!refreshed.ok) {
      return;
    }
    expect(refreshed.value.length).toBeGreaterThan(0);
    expect(refreshed.value.some((model) => model.id === defaultModel)).toBe(true);
  });

  it('validates the live optimizer profile', async () => {
    const validated = await validatePromptOptimizerProfile(PROMPT_OPTIMIZER_PROFILE_ID);
    expect(validated.ok, validated.ok ? '' : validated.error.message).toBe(true);
    if (!validated.ok) {
      return;
    }
    expect(validated.value.trim().length).toBeGreaterThan(0);
  }, 20000);

  it('optimizes a prompt through the live provider', async () => {
    const optimized = await optimizePrompt({ prompt: 'red square' });
    expect(optimized.ok, optimized.ok ? '' : optimized.error.message).toBe(true);
    if (!optimized.ok) {
      return;
    }
    expect(optimized.value.trim().length).toBeGreaterThan(0);
    expect(optimized.value).not.toBe('red square');
  }, 20000);
});

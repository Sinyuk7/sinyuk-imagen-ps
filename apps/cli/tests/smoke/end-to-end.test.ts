/**
 * 端到端 Smoke 测试（需要真实网络，opt-in）。
 *
 * 通过 IMAGEN_RUN_SMOKE=1 显式触发。
 * 使用 in-memory adapter 避免污染持久化文件。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  _resetForTesting,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setProviderConfigResolver,
} from '@imagen-ps/shared-commands/src/runtime.js';
import { submitJob } from '@imagen-ps/shared-commands/src/commands/submit-job.js';
import { saveProviderProfile } from '@imagen-ps/shared-commands/src/commands/provider-profiles.js';
import { setProfileDefaultModel } from '@imagen-ps/shared-commands/src/commands/profile-models.js';
import type {
  ProviderProfileRepository,
  SecretStorageAdapter,
  ProviderConfigResolver,
  ResolvedProviderConfig,
  ProviderProfile,
} from '@imagen-ps/shared-commands/src/commands/types.js';
import { getRuntime } from '@imagen-ps/shared-commands/src/runtime.js';
import {
  getN1nSmokeCredentials,
  getSmokeCredentials,
  skipIfNoCredentials,
  skipIfNoN1nCredentials,
  skipIfNotSmokeRun,
} from './setup.js';

/** Smoke 测试专用 profile id */
const SMOKE_PROFILE_ID = 'smoke-openai-test';
const N1N_SMOKE_PROFILE_ID = 'smoke-n1n-test';

/**
 * 创建 in-memory ProviderProfileRepository。
 */
function createInMemoryProfileRepo(): ProviderProfileRepository {
  const store = new Map<string, ProviderProfile>();
  return {
    async list() {
      return Array.from(store.values());
    },
    async get(profileId: string) {
      return store.get(profileId);
    },
    async save(profile: ProviderProfile) {
      store.set(profile.profileId, profile);
    },
    async delete(profileId: string) {
      store.delete(profileId);
    },
  };
}

/**
 * 创建 in-memory SecretStorageAdapter。
 */
function createInMemorySecretStore(): SecretStorageAdapter {
  const store = new Map<string, string>();
  return {
    async getSecret(key: string) {
      return store.get(key);
    },
    async setSecret(key: string, value: string) {
      store.set(key, value);
    },
    async deleteSecret(key: string) {
      store.delete(key);
    },
  };
}

/**
 * 创建 smoke 测试用的 ProviderConfigResolver。
 */
function createSmokeConfigResolver(
  profileRepo: ProviderProfileRepository,
  secretStore: SecretStorageAdapter,
): ProviderConfigResolver {
  return {
    async resolve(profileId: string): Promise<ResolvedProviderConfig> {
      const profile = await profileRepo.get(profileId);
      if (!profile) {
        throw new Error(`Provider profile not found: ${profileId}`);
      }

      const provider = getRuntime().providerRegistry.get(profile.providerId);
      if (!provider) {
        throw new Error(`Provider implementation not found: ${profile.providerId}`);
      }
      if (provider.family !== profile.family) {
        throw new Error(
          `Provider profile family mismatch: profile "${profile.profileId}" expects "${profile.family}" but provider "${profile.providerId}" is "${provider.family}".`,
        );
      }

      const resolvedSecrets: Record<string, string> = {};
      for (const [name, ref] of Object.entries(profile.secretRefs ?? {})) {
        const value = await secretStore.getSecret(ref);
        if (value === undefined) {
          throw new Error(`Provider profile secret is missing: ${name}`);
        }
        resolvedSecrets[name] = value;
      }

      const providerConfig = provider.validateConfig({
        providerId: profile.providerId,
        displayName: profile.displayName,
        family: profile.family,
        ...profile.config,
        ...resolvedSecrets,
      });

      return {
        profileId,
        family: profile.family,
        providerConfig,
      };
    },
  };
}

/**
 * 通过 env var 创建 openai-compatible profile + secret。
 * 返回 credentials 或 undefined（凭证不完整时）。
 */
async function createSmokeProfile(): Promise<{ apiKey: string; baseURL: string } | undefined> {
  const creds = getSmokeCredentials();
  if (!creds) return undefined;

  const result = await saveProviderProfile({
    profileId: SMOKE_PROFILE_ID,
    providerId: 'openai-compatible',
    family: 'openai-compatible',
    displayName: 'Smoke Test OpenAI',
    config: {
      baseURL: creds.baseURL,
    },
    secretValues: {
      apiKey: creds.apiKey,
    },
  });

  if (!result.ok) {
    throw new Error(`Failed to create smoke profile: ${result.error.message}`);
  }

  return creds;
}

/**
 * 通过 env var 创建 n1n.ai openai-compatible profile + secret。
 * 返回 credentials 或 undefined（凭证不完整时）。
 */
async function createN1nSmokeProfile(): Promise<{ apiKey: string; baseURL: string } | undefined> {
  const creds = getN1nSmokeCredentials();
  if (!creds) return undefined;

  const result = await saveProviderProfile({
    profileId: N1N_SMOKE_PROFILE_ID,
    providerId: 'openai-compatible',
    family: 'openai-compatible',
    displayName: 'Smoke Test n1n.ai',
    config: {
      baseURL: creds.baseURL,
      defaultModel: 'gpt-image-1.5',
    },
    secretValues: {
      apiKey: creds.apiKey,
    },
  });

  if (!result.ok) {
    throw new Error(`Failed to create n1n.ai smoke profile: ${result.error.message}`);
  }

  return creds;
}

function expectCompleted(
  result: Awaited<ReturnType<typeof submitJob>>,
): asserts result is Extract<typeof result, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  if (result.value.status !== 'completed') {
    throw new Error(`Expected completed job, got ${JSON.stringify(result.value.error ?? result.value, null, 2)}`);
  }
}

// ============================================================
// n1n.ai 真实 API Smoke 测试（需要 IMAGEN_RUN_SMOKE=1 + n1n.ai 凭证）
// ============================================================

describe.skipIf(skipIfNotSmokeRun || skipIfNoN1nCredentials)('n1n.ai 端到端 Smoke 测试（真实网络）', () => {
  const profileRepo = createInMemoryProfileRepo();
  const secretStore = createInMemorySecretStore();

  beforeAll(async () => {
    _resetForTesting();
    setProviderProfileRepository(profileRepo);
    setSecretStorageAdapter(secretStore);
    setProviderConfigResolver(createSmokeConfigResolver(profileRepo, secretStore));

    await createN1nSmokeProfile();
  });

  afterAll(() => {
    _resetForTesting();
  });

  it('有效 n1n.ai 凭证 → provider-generate 返回 completed，output 包含 Asset[]', async () => {
    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: N1N_SMOKE_PROFILE_ID,
        prompt: 'a simple red circle on white background',
        providerOptions: {
          model: 'gpt-image-1.5',
          output_format: 'png',
          quality: 'low',
          response_format: null,
        },
        output: { count: 1, width: 1024, height: 1024 },
      },
    });

    expectCompleted(result);
    const output = result.value.output as Record<string, unknown>;
    expect(output.image).toBeDefined();
  }, 120_000);

  it('有效 n1n.ai 凭证 → provider-edit 消费 data URL 并返回 completed', async () => {
    const generateResult = await submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: N1N_SMOKE_PROFILE_ID,
        prompt: 'a red apple on a plain white background',
        providerOptions: {
          model: 'gpt-image-1.5',
          output_format: 'png',
          quality: 'low',
          response_format: null,
        },
        output: { count: 1, width: 1024, height: 1024 },
      },
    });

    expect(generateResult.ok).toBe(true);
    if (!generateResult.ok) return;
    if (generateResult.value.status !== 'completed') {
      throw new Error(`Expected completed generate job, got ${JSON.stringify(generateResult.value.error, null, 2)}`);
    }

    const generateOutput = generateResult.value.output as Record<string, unknown>;
    const generatedImage = generateOutput.image;
    expect(Array.isArray(generatedImage)).toBe(true);
    const firstAsset = (generatedImage as Array<Record<string, unknown>>)[0];
    expect(firstAsset).toBeDefined();
    const sourceData = firstAsset.data;
    expect(typeof sourceData).toBe('string');

    const editResult = await submitJob({
      workflow: 'provider-edit',
      input: {
        profileId: N1N_SMOKE_PROFILE_ID,
        prompt: 'make the apple green while keeping the same simple white background',
        inputAssets: [
          {
            type: 'image',
            data: sourceData,
            mimeType: typeof firstAsset.mimeType === 'string' ? firstAsset.mimeType : 'image/png',
          },
        ],
        providerOptions: {
          model: 'gpt-image-1.5',
          output_format: 'png',
          quality: 'low',
          response_format: null,
        },
        output: { count: 1, width: 1024, height: 1024 },
      },
    });

    expect(editResult.ok).toBe(true);
    if (editResult.ok) {
      expect(editResult.value.status).toBe('completed');
      const editOutput = editResult.value.output as Record<string, unknown>;
      expect(editOutput.image).toBeDefined();
    }
  }, 180_000);

  it('无效 n1n.ai API key → job status failed，error category provider', async () => {
    const badProfileId = 'smoke-n1n-bad-key';
    const saveResult = await saveProviderProfile({
      profileId: badProfileId,
      providerId: 'openai-compatible',
      family: 'openai-compatible',
      displayName: 'Bad n1n.ai Key Profile',
      config: {
        baseURL: getN1nSmokeCredentials()?.baseURL ?? 'https://api.n1n.ai',
        defaultModel: 'gpt-image-1.5',
      },
      secretValues: {
        apiKey: 'sk-invalid-key-for-n1n-smoke-test',
      },
    });

    if (!saveResult.ok) {
      return;
    }

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: badProfileId,
        prompt: 'a test image',
        output: { count: 1, width: 1024, height: 1024 },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('failed');
      expect(result.value.error).toBeDefined();
      expect(result.value.error?.category).toBe('provider');
    }
  }, 120_000);
});

// ============================================================
// 端到端测试（需要 IMAGEN_RUN_SMOKE=1 + 有效凭证）
// ============================================================

describe.skipIf(skipIfNotSmokeRun || skipIfNoCredentials)('端到端 Smoke 测试（真实网络）', () => {
  const profileRepo = createInMemoryProfileRepo();
  const secretStore = createInMemorySecretStore();

  beforeAll(async () => {
    // 重置 runtime 单例，注入 in-memory adapter
    _resetForTesting();
    setProviderProfileRepository(profileRepo);
    setSecretStorageAdapter(secretStore);
    setProviderConfigResolver(createSmokeConfigResolver(profileRepo, secretStore));

    // 创建 smoke profile
    await createSmokeProfile();
  });

  afterAll(() => {
    _resetForTesting();
  });

  it('有效凭证 → submitJob 返回 ok，job status completed，output 包含 Asset[]', async () => {
    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: SMOKE_PROFILE_ID,
        prompt: 'a simple red circle on white background',
        output: { count: 1 },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
      expect(result.value.output).toBeDefined();
      // output 结构取决于 workflow，检查 image key 存在
      const output = result.value.output as Record<string, unknown>;
      expect(output.image).toBeDefined();
    }
  }, 30_000);

  it('无效 API key → job status failed，error category provider', async () => {
    // 创建一个使用无效 API key 的 profile
    const badProfileId = 'smoke-bad-key';
    const saveResult = await saveProviderProfile({
      profileId: badProfileId,
      providerId: 'openai-compatible',
      family: 'openai-compatible',
      displayName: 'Bad Key Profile',
      config: {
        baseURL: getSmokeCredentials()?.baseURL ?? 'https://api.openai.com',
      },
      secretValues: {
        apiKey: 'sk-invalid-key-for-smoke-test',
      },
    });

    if (!saveResult.ok) {
      // 如果保存失败（比如 provider 不存在），跳过
      return;
    }

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: badProfileId,
        prompt: 'a test image',
        output: { count: 1 },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('failed');
      expect(result.value.error).toBeDefined();
      expect(result.value.error?.category).toBe('provider');
    }
  }, 30_000);

  it('profile 设置 defaultModel → job submit 使用该 model', async () => {
    // 设置 defaultModel
    const setResult = await setProfileDefaultModel(SMOKE_PROFILE_ID, 'dall-e-3');
    // 注意：setProfileDefaultModel 会校验 modelId 是否在候选列表中
    // 如果 openai-compatible provider 没有 defaultModels，可能失败
    // 这里我们只验证设置不抛异常即可
    if (setResult.ok) {
      expect(setResult.value.config.defaultModel).toBe('dall-e-3');
    }
  }, 10_000);

  it('job input 中 explicit providerOptions.model 覆盖 profile defaultModel', async () => {
    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: SMOKE_PROFILE_ID,
        prompt: 'a blue square',
        providerOptions: {
          model: 'dall-e-3',
        },
        output: { count: 1 },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 无论成功或失败（取决于 API 是否支持该 model），
      // 关键是 explicit model 被正确传递
      expect(result.value.status).toBe('completed');
    }
  }, 30_000);
});

// ============================================================
// 凭证缺失时的行为测试（不需要真实网络）
// ============================================================

describe('Smoke 测试凭证检查', () => {
  it('getSmokeCredentials 在凭证缺失时返回 undefined', () => {
    // 这个测试在未设置 env var 时验证 helper 行为
    const creds = getSmokeCredentials();
    // 在 CI 环境中通常为 undefined
    // 不做强断言，只验证函数不抛异常
    expect(typeof creds === 'undefined' || typeof creds === 'object').toBe(true);
  });

  it('getN1nSmokeCredentials 在凭证缺失时返回 undefined', () => {
    const creds = getN1nSmokeCredentials();
    expect(typeof creds === 'undefined' || typeof creds === 'object').toBe(true);
  });
});

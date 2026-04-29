/**
 * `saveProviderProfile` 不再接受 `models` 字段的回归测试。
 *
 * - 编译期：`@ts-expect-error` 验证 `ProviderProfileInput` 不含 `models` 字段。
 * - 运行时：保存现有带 `models` cache 的 profile 时，`models` MUST 保持原值，
 *   不被擦除；即使野调用方绕过 typing 传 `models`，也 MUST 不被采用。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  saveProviderProfile,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  type ProviderProfile,
  type ProviderProfileInput,
  type ProviderProfileRepository,
} from '../src/commands/index.js';
import { _resetForTesting } from '../src/runtime.js';

function makeRepo(initial: ProviderProfile[]): {
  repo: ProviderProfileRepository;
  store: Map<string, ProviderProfile>;
} {
  const store = new Map(initial.map((p) => [p.profileId, p]));
  const repo: ProviderProfileRepository = {
    async list() {
      return Array.from(store.values());
    },
    async get(profileId) {
      return store.get(profileId);
    },
    async save(profile) {
      store.set(profile.profileId, profile);
    },
    async delete(profileId) {
      store.delete(profileId);
    },
  };
  return { repo, store };
}

describe('saveProviderProfile rejects models field', () => {
  beforeEach(() => {
    _resetForTesting();
    setSecretStorageAdapter({
      async getSecret(key) {
        return key.endsWith('apiKey') ? 'mock-key' : undefined;
      },
      async setSecret() {},
      async deleteSecret() {},
    });
  });

  afterEach(() => {
    _resetForTesting();
  });

  it('compile-time: ProviderProfileInput type MUST NOT declare a `models` field', () => {
    // 这一段代码在编译期生效；如果 ProviderProfileInput 又出现 models 字段，
    // 下面的 @ts-expect-error 将变得不必要，导致编译失败，从而提醒回归。
    const input: ProviderProfileInput = {
      profileId: 'mock-typecheck',
      family: 'openai-compatible',
      displayName: 'Mock Typecheck',
      config: { baseURL: 'https://mock.local' },
      secretValues: { apiKey: 'secret-key' },
      // @ts-expect-error - ProviderProfileInput must not declare a `models` field.
      models: [{ id: 'should-be-rejected' }],
    };
    expect(input.profileId).toBe('mock-typecheck');
  });

  it('runtime: saveProviderProfile preserves existing.models cache when no input.models is provided', async () => {
    const existing: ProviderProfile = {
      profileId: 'mock-existing',
      providerId: 'mock',
      family: 'openai-compatible',
      displayName: 'Original',
      enabled: true,
      config: { baseURL: 'https://mock.local' },
      secretRefs: { apiKey: 'secret:mock-existing:apiKey' },
      models: [{ id: 'mock-image-v1' }],
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
    };
    const { repo, store } = makeRepo([existing]);
    setProviderProfileRepository(repo);

    const result = await saveProviderProfile({
      profileId: 'mock-existing',
      providerId: 'mock',
      family: 'openai-compatible',
      displayName: 'Renamed',
      config: { baseURL: 'https://mock.local' },
      secretValues: { apiKey: 'secret-key' },
    });
    expect(result.ok).toBe(true);

    const persisted = store.get('mock-existing');
    expect(persisted?.displayName).toBe('Renamed');
    // models cache preserved
    expect(persisted?.models).toEqual([{ id: 'mock-image-v1' }]);
  });

  it('runtime: saveProviderProfile ignores any rogue `models` value bypassing the type system', async () => {
    const existing: ProviderProfile = {
      profileId: 'mock-rogue',
      providerId: 'mock',
      family: 'openai-compatible',
      displayName: 'Existing Rogue',
      enabled: true,
      config: { baseURL: 'https://mock.local' },
      secretRefs: { apiKey: 'secret:mock-rogue:apiKey' },
      models: [{ id: 'mock-image-v1' }],
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
    };
    const { repo, store } = makeRepo([existing]);
    setProviderProfileRepository(repo);

    // 野调用方：绕过 typing 强行传入 models
    const rogueInput = {
      profileId: 'mock-rogue',
      providerId: 'mock',
      family: 'openai-compatible' as const,
      displayName: 'Renamed',
      config: { baseURL: 'https://mock.local' },
      secretValues: { apiKey: 'secret-key' },
      models: [{ id: 'rogue-injected-model' }],
    } as unknown as ProviderProfileInput;

    const result = await saveProviderProfile(rogueInput);
    expect(result.ok).toBe(true);

    const persisted = store.get('mock-rogue');
    // existing.models 透传，rogue 输入被丢弃
    expect(persisted?.models).toEqual([{ id: 'mock-image-v1' }]);
    expect(persisted?.models).not.toEqual([{ id: 'rogue-injected-model' }]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  _resetForTesting,
  setProviderProfileRepository,
  setSecretStorageAdapter,
} from '../runtime.js';
import {
  PROMPT_OPTIMIZER_PROFILE_ID,
  ensurePromptOptimizerProfile,
  optimizePrompt,
  validatePromptOptimizerProfile,
} from './prompt-optimize.js';
import { deleteProviderProfile, saveProviderProfile } from './provider-profiles.js';
import type { ProviderProfile, ProviderProfileRepository, SecretStorageAdapter } from './types.js';

function createSecretStorage(): SecretStorageAdapter {
  const store = new Map<string, string>([['secret:optimizer:apiKey', 'test-key']]);
  return {
    async getSecret(key) {
      return store.get(key);
    },
    async setSecret(key, value) {
      store.set(key, value);
    },
    async deleteSecret(key) {
      store.delete(key);
    },
  };
}

function createProfileRepository(profiles: ProviderProfile[]): ProviderProfileRepository & {
  readonly snapshot: () => readonly ProviderProfile[];
} {
  const store = new Map<string, ProviderProfile>(profiles.map((profile) => [profile.profileId, profile]));
  return {
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
    snapshot() {
      return Array.from(store.values());
    },
  };
}

const optimizerProfile: ProviderProfile = {
  profileId: PROMPT_OPTIMIZER_PROFILE_ID,
  providerId: 'prompt-optimize',
  displayName: 'Prompt Optimizer',
  enabled: true,
  config: {
    providerId: 'prompt-optimize',
    displayName: 'Prompt Optimizer',
    family: 'prompt-optimize',
    connection: {
      selectionMode: 'manual',
      failoverEnabled: false,
      preferredEndpointId: 'primary',
      endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
    },
    defaultModel: 'gpt-4o-mini',
    instruction: 'Rewrite the prompt.',
    testPrompt: 'test',
  },
  secretRefs: { apiKey: 'secret:optimizer:apiKey' },
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};

function mockChatCompletionResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('prompt-optimize commands', () => {
  it('creates the reserved profile when missing', async () => {
    _resetForTesting();
    const repository = createProfileRepository([]);
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(createSecretStorage());

    const result = await ensurePromptOptimizerProfile();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.profileId).toBe(PROMPT_OPTIMIZER_PROFILE_ID);
    expect(result.value.providerId).toBe('prompt-optimize');
    expect(result.value.enabled).toBe(false);
    expect(result.value.config.instruction).toBeTruthy();
  });

  it('preserves existing optimizer profile on ensure', async () => {
    _resetForTesting();
    const repository = createProfileRepository([{ ...optimizerProfile, displayName: 'Custom' }]);
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(createSecretStorage());

    const result = await ensurePromptOptimizerProfile();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.displayName).toBe('Custom');
  });

  it('rejects optimize when profile is disabled', async () => {
    _resetForTesting();
    setProviderProfileRepository(createProfileRepository([{ ...optimizerProfile, enabled: false }]));
    setSecretStorageAdapter(createSecretStorage());

    const result = await optimizePrompt({ prompt: 'a red square' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('not enabled');
  });

  it('optimizes prompt through provider dispatch and returns text', async () => {
    _resetForTesting();
    setProviderProfileRepository(createProfileRepository([optimizerProfile]));
    setSecretStorageAdapter(createSecretStorage());
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatCompletionResponse('a vivid red square with studio lighting'),
    );

    const result = await optimizePrompt({ prompt: 'a red square' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toBe('a vivid red square with studio lighting');
    fetchSpy.mockRestore();
  });

  it('uses the optimizer profile defaultModel as the actual request model', async () => {
    _resetForTesting();
    setProviderProfileRepository(
      createProfileRepository([
        {
          ...optimizerProfile,
          config: {
            ...optimizerProfile.config,
            defaultModel: 'openai/gpt-4.1-mini',
          },
        },
      ]),
    );
    setSecretStorageAdapter(createSecretStorage());
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      expect(body.model).toBe('openai/gpt-4.1-mini');
      return mockChatCompletionResponse('optimized with configured model');
    });

    const result = await optimizePrompt({ prompt: 'a red square' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toBe('optimized with configured model');
    fetchSpy.mockRestore();
  });

  it('rejects empty optimizer response', async () => {
    _resetForTesting();
    setProviderProfileRepository(createProfileRepository([optimizerProfile]));
    setSecretStorageAdapter(createSecretStorage());
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatCompletionResponse('   '),
    );

    const result = await optimizePrompt({ prompt: 'a red square' });

    expect(result.ok).toBe(false);
    fetchSpy.mockRestore();
  });

  it('validate enables profile on success', async () => {
    _resetForTesting();
    const disabled = { ...optimizerProfile, enabled: false };
    const repository = createProfileRepository([disabled]);
    setProviderProfileRepository(repository);
    setSecretStorageAdapter(createSecretStorage());
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockChatCompletionResponse('optimized test prompt'),
    );

    const result = await validatePromptOptimizerProfile(PROMPT_OPTIMIZER_PROFILE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toBe('optimized test prompt');
    const saved = repository.snapshot().find((profile) => profile.profileId === PROMPT_OPTIMIZER_PROFILE_ID);
    expect(saved?.enabled).toBe(true);
    fetchSpy.mockRestore();
  });

  it('protects reserved profile from deletion', async () => {
    _resetForTesting();
    setProviderProfileRepository(createProfileRepository([optimizerProfile]));
    setSecretStorageAdapter(createSecretStorage());

    const result = await deleteProviderProfile(PROMPT_OPTIMIZER_PROFILE_ID);

    expect(result.ok).toBe(false);
  });

  it('rejects saving reserved profile with wrong providerId', async () => {
    _resetForTesting();
    setProviderProfileRepository(createProfileRepository([optimizerProfile]));
    setSecretStorageAdapter(createSecretStorage());

    const result = await saveProviderProfile({
      profileId: PROMPT_OPTIMIZER_PROFILE_ID,
      providerId: 'mock',
      displayName: 'Prompt Optimizer',
      enabled: true,
      config: optimizerProfile.config,
    });

    expect(result.ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { _resetForTesting, setProviderProfileRepository, setSecretStorageAdapter } from './runtime.js';
import { submitJob } from './commands/submit-job.js';
import type { ProviderProfile, ProviderProfileRepository, SecretStorageAdapter } from './commands/types.js';

function createProfileRepository(profile: ProviderProfile): ProviderProfileRepository {
  return {
    async list() {
      return [profile];
    },
    async get(profileId: string) {
      return profileId === profile.profileId ? profile : undefined;
    },
    async save() {},
    async delete() {},
  };
}

function createSecretStorage(): SecretStorageAdapter {
  return {
    async getSecret() {
      return 'mock-key';
    },
    async setSecret() {},
    async deleteSecret() {},
  };
}

describe('profile dispatch runtime', () => {
  it('does not spread unresolved providerOptions placeholders into model options', async () => {
    _resetForTesting();
    setProviderProfileRepository(
      createProfileRepository({
        profileId: 'mock-profile',
        providerId: 'mock',
        displayName: 'Mock Profile',
        config: {
          providerId: 'mock',
          displayName: 'Mock Profile',
          family: 'image-endpoint',
          baseURL: 'https://mock.local',
          defaultModel: 'mock-image-v1',
        },
        secretRefs: { apiKey: 'secret:mock' },
        enabled: true,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
      }),
    );
    setSecretStorageAdapter(createSecretStorage());

    const result = await submitJob({
      workflow: 'provider-edit' as never,
      input: {
        profileId: 'mock-profile',
        prompt: 'make the geometric shape blue',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const image = result.value.output?.image as { raw?: { model?: unknown } };
    expect(image.raw?.model).toBe('mock-image-v1');
  });
});

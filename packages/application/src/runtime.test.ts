import { describe, expect, it } from 'vitest';
import {
  _resetForTesting,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
} from './runtime.js';
import { retryJob } from './commands/retry-job.js';
import { submitJob } from './commands/submit-job.js';
import type {
  DurableJobRecord,
  JobHistoryStore,
  ProviderProfile,
  ProviderProfileRepository,
  SecretStorageAdapter,
} from './commands/types.js';

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

function createJobHistoryStore(records: DurableJobRecord[] = []): JobHistoryStore {
  return {
    async put(record) {
      records.push(record);
    },
    async get(jobId) {
      return records.find((record) => record.jobId === jobId);
    },
    async list() {
      return records;
    },
    async delete(jobId) {
      const index = records.findIndex((record) => record.jobId === jobId);
      if (index !== -1) {
        records.splice(index, 1);
      }
    },
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

  it('flushes terminal jobs to injected durable history without raw secret values', async () => {
    _resetForTesting();
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'mock',
        prompt: 'simple blue square icon',
        profileId: 'mock-profile',
        secretRefs: {
          apiKey: 'secret:provider-profile:mock-profile:apiKey',
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      schemaVersion: 1,
      jobId: result.ok ? result.value.id : '',
      status: 'completed',
      workflow: 'provider-generate',
      input: {
        provider: 'mock',
        prompt: 'simple blue square icon',
        profileId: 'mock-profile',
        secretRefs: {
          apiKey: 'secret:provider-profile:mock-profile:apiKey',
        },
      },
    });
    expect(records[0].outputs).toHaveLength(1);
    expect(records[0].outputs[0].kind).toBe('hostObject');
    expect(records[0].outputs[0].ref).not.toContain('base64');
    expect(JSON.stringify(records[0])).not.toContain('mock-key');
  });

  it('rejects terminal history flush when job input contains secret values', async () => {
    _resetForTesting();
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));

    const result = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'mock',
        prompt: 'simple blue square icon',
        secretValues: {
          apiKey: 'sk-live-secret',
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('secret value');
    expect(records).toHaveLength(0);
  });

  it('flushes terminal retry results to durable history', async () => {
    _resetForTesting();
    const records: DurableJobRecord[] = [];
    setJobHistoryStore(createJobHistoryStore(records));

    const first = await submitJob({
      workflow: 'provider-generate',
      input: {
        provider: 'missing-provider',
        prompt: 'will fail',
      },
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.value.status).toBe('failed');
    expect(records).toHaveLength(1);

    const retry = await retryJob(first.value.id);

    expect(retry.ok).toBe(true);
    if (!retry.ok) {
      return;
    }
    expect(retry.value.status).toBe('failed');
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({
      jobId: retry.value.id,
      status: 'failed',
      workflow: 'provider-generate',
      originJobId: first.value.id,
      retryAttempt: 1,
    });
  });
});

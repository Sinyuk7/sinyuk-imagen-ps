/**
 * Commands 层单元测试
 */

import { describe, expect, it, beforeEach } from 'vitest';
import type { JobEvent } from '@imagen-ps/core-engine';

import {
  submitJob,
  getJob,
  subscribeJobEvents,
  listProviders,
  describeProvider,
  getProviderConfig,
  saveProviderConfig,
  retryJob,
  deleteProviderProfile,
  getProviderProfile,
  listProviderProfiles,
  saveProviderProfile,
  testProviderProfile,
  setConfigAdapter,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  type ConfigStorageAdapter,
  type ProviderConfig,
  type ProviderProfile,
} from '../src/commands/index.js';
import { _resetForTesting } from '../src/runtime.js';

describe('commands', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('submitJob', () => {
    it('returns { ok: true, value: Job } for provider-generate happy path', async () => {
      const result = await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'mock', prompt: 'test image' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
        expect(result.value.output).toBeDefined();
      }
    });

    it('returns { ok: true } with failed job when required provider request field is missing', async () => {
      // Note: runtime.runWorkflow does not throw for provider validation errors.
      // Instead, it returns a job with status === 'failed' and error populated.
      // submitJob wraps this as { ok: true, value: Job } because runWorkflow
      // resolved successfully - the job just happens to be in 'failed' state.
      const result = await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'mock', prompt: '' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
        expect(result.value.error?.category).toBe('validation');
        expect(result.value.error?.message).toContain('prompt');
      }
    });

    it('returns { ok: true } with failed job when provider dispatches to unknown provider', async () => {
      // Note: runtime.runWorkflow does not throw for dispatch errors.
      // The job returns with status === 'failed' and error populated.
      const result = await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'nonexistent', prompt: 'test' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
        // Dispatch to unknown provider returns a provider error (no matching adapter)
        expect(result.value.error?.category).toBe('provider');
      }
    });
  });

  describe('getJob', () => {
    it('returns Job when jobId exists', async () => {
      // First submit a job to get a valid jobId
      const submitResult = await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'mock', prompt: 'test' },
      });

      expect(submitResult.ok).toBe(true);
      if (!submitResult.ok) return;

      const job = getJob(submitResult.value.id);
      expect(job).toBeDefined();
      expect(job?.id).toBe(submitResult.value.id);
    });

    it('returns undefined when jobId does not exist', () => {
      const job = getJob('nonexistent-job-id');
      expect(job).toBeUndefined();
    });
  });

  describe('subscribeJobEvents', () => {
    it('receives created + completed events for a successful job', async () => {
      const events: JobEvent[] = [];
      const unsubscribe = subscribeJobEvents((event) => {
        events.push(event);
      });

      await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'mock', prompt: 'test' },
      });

      unsubscribe();

      // Should have received at least created and completed events
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('created');
      expect(eventTypes).toContain('completed');
    });

    it('stops receiving events after unsubscribe', async () => {
      const events: JobEvent[] = [];
      const unsubscribe = subscribeJobEvents((event) => {
        events.push(event);
      });

      // Submit first job
      await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'mock', prompt: 'first' },
      });

      const countAfterFirst = events.length;

      // Unsubscribe
      unsubscribe();

      // Submit second job
      await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'mock', prompt: 'second' },
      });

      // Should not have received events from second job
      expect(events.length).toBe(countAfterFirst);
    });

    it('isolates handler errors - other handlers still receive events', async () => {
      const handlerBEvents: JobEvent[] = [];

      // Handler A throws an error
      const unsubA = subscribeJobEvents(() => {
        throw new Error('Handler A error');
      });

      // Handler B is normal
      const unsubB = subscribeJobEvents((event) => {
        handlerBEvents.push(event);
      });

      await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'mock', prompt: 'test' },
      });

      unsubA();
      unsubB();

      // Handler B should still receive events despite Handler A throwing
      expect(handlerBEvents.length).toBeGreaterThan(0);
      expect(handlerBEvents.map((e) => e.type)).toContain('created');
    });
  });

  describe('listProviders', () => {
    it('returns registered provider descriptors', () => {
      const providers = listProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);

      const mockProvider = providers.find((p) => p.id === 'mock');
      expect(mockProvider).toBeDefined();
      expect(mockProvider?.displayName).toBeDefined();
    });
  });

  describe('describeProvider', () => {
    it('returns descriptor for existing provider', () => {
      const descriptor = describeProvider('mock');
      expect(descriptor).toBeDefined();
      expect(descriptor?.id).toBe('mock');
      expect(descriptor?.family).toBeDefined();
      expect(descriptor?.capabilities).toBeDefined();
    });

    it('returns undefined for non-existent provider', () => {
      const descriptor = describeProvider('nonexistent');
      expect(descriptor).toBeUndefined();
    });
  });

  describe('getProviderConfig', () => {
    it('returns error when no config saved', async () => {
      const result = await getProviderConfig('mock');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('validation');
        expect(result.error.message).toContain('mock');
      }
    });

    it('returns error for non-existent provider', async () => {
      const result = await getProviderConfig('nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('validation');
      }
    });

    it('returns config after save', async () => {
      const validConfig = {
        providerId: 'mock',
        displayName: 'Test Mock',
        family: 'openai-compatible',
        baseURL: 'https://test.local',
        apiKey: 'test-key',
      };

      await saveProviderConfig('mock', validConfig);
      const result = await getProviderConfig('mock');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.providerId).toBe('mock');
      }
    });
  });

  describe('saveProviderConfig', () => {
    it('saves valid config', async () => {
      const validConfig = {
        providerId: 'mock',
        displayName: 'Test Mock',
        family: 'openai-compatible',
        baseURL: 'https://test.local',
        apiKey: 'test-key',
      };

      const result = await saveProviderConfig('mock', validConfig);
      expect(result.ok).toBe(true);
    });

    it('returns error for invalid config', async () => {
      const invalidConfig = { invalid: true };
      const result = await saveProviderConfig('mock', invalidConfig);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('validation');
      }
    });

    it('returns error for non-existent provider', async () => {
      const result = await saveProviderConfig('nonexistent', {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('validation');
      }
    });
  });

  describe('retryJob', () => {
    it('creates new job with same input for completed job', async () => {
      const submitResult = await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'mock', prompt: 'retry test' },
      });

      expect(submitResult.ok).toBe(true);
      if (!submitResult.ok) return;

      const retryResult = await retryJob(submitResult.value.id);
      expect(retryResult.ok).toBe(true);
      if (retryResult.ok) {
        expect(retryResult.value.id).not.toBe(submitResult.value.id);
        expect(retryResult.value.status).toBe('completed');
      }
    });

    it('returns error for non-existent job', async () => {
      const result = await retryJob('nonexistent-job');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('validation');
        expect(result.error.message).toContain('nonexistent-job');
      }
    });
  });

  describe('setConfigAdapter', () => {
    it('custom adapter is used after set', async () => {
      const customStore = new Map<string, ProviderConfig>();
      const customAdapter: ConfigStorageAdapter = {
        async get(id) {
          return customStore.get(id);
        },
        async save(id, config) {
          customStore.set(id, config);
        },
      };

      setConfigAdapter(customAdapter);

      const validConfig = {
        providerId: 'mock',
        displayName: 'Custom Test',
        family: 'openai-compatible',
        baseURL: 'https://custom.local',
        apiKey: 'custom-key',
      };

      await saveProviderConfig('mock', validConfig);

      // Verify custom store was used
      expect(customStore.has('mock')).toBe(true);
    });

    it('_resetForTesting resets to default adapter', async () => {
      const customStore = new Map<string, ProviderConfig>();
      const customAdapter: ConfigStorageAdapter = {
        async get(id) {
          return customStore.get(id);
        },
        async save(id, config) {
          customStore.set(id, config);
        },
      };

      setConfigAdapter(customAdapter);

      const validConfig = {
        providerId: 'mock',
        displayName: 'Before Reset',
        family: 'openai-compatible',
        baseURL: 'https://before.local',
        apiKey: 'before-key',
      };

      await saveProviderConfig('mock', validConfig);
      expect(customStore.has('mock')).toBe(true);

      _resetForTesting();

      // After reset, config should not be found (new in-memory adapter)
      const result = await getProviderConfig('mock');
      expect(result.ok).toBe(false);
    });
  });

  describe('provider profile lifecycle', () => {
    const profileInput = {
      profileId: 'mock-profile',
      providerId: 'mock',
      family: 'openai-compatible' as const,
      displayName: 'Mock Profile',
      config: {
        baseURL: 'https://mock.local',
      },
      secretValues: {
        apiKey: 'secret-key',
      },
    };

    it('uses default in-memory repository and secret storage without leaking secret values', async () => {
      const saveResult = await saveProviderProfile(profileInput);
      expect(saveResult.ok).toBe(true);
      if (!saveResult.ok) return;

      expect(JSON.stringify(saveResult.value)).not.toContain('secret-key');
      expect(saveResult.value.secretRefs?.apiKey).toBe('secret:provider-profile:mock-profile:apiKey');

      const listResult = await listProviderProfiles();
      expect(listResult.ok).toBe(true);
      if (listResult.ok) {
        expect(listResult.value).toHaveLength(1);
        expect(JSON.stringify(listResult.value)).not.toContain('secret-key');
      }

      const getResult = await getProviderProfile('mock-profile');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.profileId).toBe('mock-profile');
        expect(JSON.stringify(getResult.value)).not.toContain('secret-key');
      }
    });

    it('testProviderProfile validates through resolver without returning resolved secret-bearing config', async () => {
      await saveProviderProfile(profileInput);

      const result = await testProviderProfile('mock-profile');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          profileId: 'mock-profile',
          providerId: 'mock',
          family: 'openai-compatible',
          valid: true,
        });
        expect(JSON.stringify(result.value)).not.toContain('secret-key');
      }
    });

    it('returns validation errors for missing profile and missing secret', async () => {
      const missingProfile = await getProviderProfile('missing-profile');
      expect(missingProfile.ok).toBe(false);
      if (!missingProfile.ok) {
        expect(missingProfile.error.category).toBe('validation');
      }

      const profile: ProviderProfile = {
        profileId: 'broken-profile',
        providerId: 'mock',
        family: 'openai-compatible',
        displayName: 'Broken Profile',
        enabled: true,
        config: { baseURL: 'https://mock.local' },
        secretRefs: { apiKey: 'secret:missing' },
        createdAt: '2026-04-29T00:00:00.000Z',
        updatedAt: '2026-04-29T00:00:00.000Z',
      };
      const store = new Map<string, ProviderProfile>([[profile.profileId, profile]]);
      setProviderProfileRepository({
        async list() {
          return Array.from(store.values());
        },
        async get(profileId) {
          return store.get(profileId);
        },
        async save(nextProfile) {
          store.set(nextProfile.profileId, nextProfile);
        },
        async delete(profileId) {
          store.delete(profileId);
        },
      });
      setSecretStorageAdapter({
        async getSecret() {
          return undefined;
        },
        async setSecret() {},
        async deleteSecret() {},
      });

      const missingSecret = await testProviderProfile('broken-profile');
      expect(missingSecret.ok).toBe(false);
      if (!missingSecret.ok) {
        expect(missingSecret.error.category).toBe('validation');
        expect(missingSecret.error.message).toContain('apiKey');
        expect(missingSecret.error.message).not.toContain('secret-key');
      }
    });

    it('deleteProviderProfile deletes associated secrets by default', async () => {
      await saveProviderProfile(profileInput);
      const deleteResult = await deleteProviderProfile('mock-profile');
      expect(deleteResult.ok).toBe(true);

      const getResult = await getProviderProfile('mock-profile');
      expect(getResult.ok).toBe(false);

      const testResult = await testProviderProfile('mock-profile');
      expect(testResult.ok).toBe(false);
    });

    it('dispatches provider-generate through provider profile resolution', async () => {
      await saveProviderProfile(profileInput);

      const result = await submitJob({
        workflow: 'provider-generate',
        input: { provider: 'profile', providerProfileId: 'mock-profile', prompt: 'profile prompt' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        if (result.value.status !== 'completed') {
          throw new Error('Job failed: ' + JSON.stringify(result.value.error, null, 2));
        }
        expect(result.value.status).toBe('completed');
        expect(JSON.stringify(result.value)).not.toContain('secret-key');
      }
    });

    it('dispatches provider-generate with only profileId (auto-routes to profile adapter)', async () => {
      await saveProviderProfile(profileInput);

      const result = await submitJob({
        workflow: 'provider-generate',
        input: { profileId: 'mock-profile', prompt: 'profile prompt' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({ status: 'completed' });
        expect(JSON.stringify(result.value)).not.toContain('secret-key');
      }
    });

    it('prefers explicit providerProfileId over profileId', async () => {
      // 创建两个 profile
      await saveProviderProfile(profileInput);
      await saveProviderProfile({
        ...profileInput,
        profileId: 'other-profile',
        displayName: 'Other Profile',
      });

      const result = await submitJob({
        workflow: 'provider-generate',
        input: {
          providerProfileId: 'other-profile',
          profileId: 'mock-profile',
          prompt: 'test',
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({ status: 'completed' });
      }
    });

    it('dispatches provider-edit through provider profile resolution', async () => {
      await saveProviderProfile(profileInput);

      const result = await submitJob({
        workflow: 'provider-edit',
        input: {
          provider: 'profile',
          providerProfileId: 'mock-profile',
          prompt: 'profile edit prompt',
          inputAssets: [
            {
              type: 'image' as const,
              name: 'input.png',
              url: 'https://example.com/input.png',
              mimeType: 'image/png',
            },
          ],
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        if (result.value.status === 'failed') {
          throw new Error(
            'Job failed: ' + JSON.stringify({ error: result.value.error, output: result.value.output }, null, 2),
          );
        }
        expect(result.value).toMatchObject({ status: 'completed' });
        expect(JSON.stringify(result.value)).not.toContain('secret-key');
      }
    });

    it('dispatches provider-edit with only profileId (auto-routes to profile adapter)', async () => {
      await saveProviderProfile(profileInput);

      const result = await submitJob({
        workflow: 'provider-edit',
        input: {
          profileId: 'mock-profile',
          prompt: 'profile edit prompt',
          inputAssets: [
            {
              type: 'image' as const,
              name: 'input.png',
              url: 'https://example.com/input.png',
              mimeType: 'image/png',
            },
          ],
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({ status: 'completed' });
        expect(JSON.stringify(result.value)).not.toContain('secret-key');
      }
    });

    it('prefers explicit providerProfileId over profileId for provider-edit', async () => {
      // 创建两个 profile
      await saveProviderProfile(profileInput);
      await saveProviderProfile({
        ...profileInput,
        profileId: 'other-profile',
        displayName: 'Other Profile',
      });

      const result = await submitJob({
        workflow: 'provider-edit',
        input: {
          providerProfileId: 'other-profile',
          profileId: 'mock-profile',
          prompt: 'test edit',
          inputAssets: [
            {
              type: 'image' as const,
              name: 'input.png',
              url: 'https://example.com/input.png',
              mimeType: 'image/png',
            },
          ],
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({ status: 'completed' });
      }
    });

    it('rejects when both providerProfileId and profileId are template literal placeholders', async () => {
      const result = await submitJob({
        workflow: 'provider-generate',
        input: {
          provider: 'profile',
          providerProfileId: '${providerProfileId}',
          profileId: '${profileId}',
          prompt: 'test',
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
        expect(result.value.error?.message).toContain(
          'Provider profile dispatch requires a non-empty providerProfileId or profileId',
        );
      }
    });

    it('does not override explicit provider with profile adapter', async () => {
      await saveProviderProfile(profileInput);

      const result = await submitJob({
        workflow: 'provider-generate',
        input: {
          provider: 'mock',
          profileId: 'mock-profile',
          prompt: 'direct provider wins',
        },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({ status: 'completed' });
      }
    });
  });
});

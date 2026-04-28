/**
 * Commands 层单元测试。
 */

import { describe, expect, it, beforeEach } from 'vitest';
import type { JobEvent } from '@imagen-ps/core-engine';
import { createMockProvider, createDispatchAdapter } from '@imagen-ps/providers';
import { builtinWorkflows } from '@imagen-ps/workflows';

import { submitJob, getJob, subscribeJobEvents } from '../src/shared/commands/index.js';
import { _resetForTesting } from '../src/shared/runtime.js';

/**
 * 创建带有 failMode 的 mock provider adapter。
 */
function createFailingMockAdapter() {
  const provider = createMockProvider();
  const config = provider.validateConfig({
    failMode: { type: 'always' },
  });
  return createDispatchAdapter({ provider, config });
}

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

    it('returns { ok: true } with failed job when binding is missing', async () => {
      // Note: runtime.runWorkflow does not throw for workflow errors.
      // Instead, it returns a job with status === 'failed' and error populated.
      // submitJob wraps this as { ok: true, value: Job } because runWorkflow
      // resolved successfully - the job just happens to be in 'failed' state.
      const result = await submitJob({
        workflow: 'provider-generate',
        // Missing `prompt` binding
        input: { provider: 'mock' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
        expect(result.value.error?.category).toBe('workflow');
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
      const handlerAEvents: JobEvent[] = [];
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
});

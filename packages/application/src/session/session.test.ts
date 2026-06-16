import { describe, expect, it, vi } from 'vitest';
import type { Job, JobEvent, JobEventHandler, SubmitJobInput, Unsubscribe } from '../commands/types.js';
import { createImagenSession } from './session.js';
import type { ImagenSessionCommands, ImagenSessionSnapshot } from './types.js';

function createJob(overrides: Partial<Job> & Pick<Job, 'id' | 'status' | 'input'>): Job {
  const now = '2026-06-16T00:00:00.000Z';
  return {
    output: undefined,
    error: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createCommands(): {
  readonly commands: ImagenSessionCommands;
  readonly emit: (event: JobEvent) => void;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
} {
  const listeners = new Set<JobEventHandler>();
  const unsubscribe = vi.fn();

  return {
    commands: {
      async submitJob(input: SubmitJobInput) {
        return {
          ok: true,
          value: createJob({
            id: 'job-completed',
            status: 'completed',
            input: {
              ...input.input,
              _workflowName: input.workflow,
            },
            output: {
              image: {
                assets: [],
              },
            },
          }),
        };
      },
      async retryJob(jobId: string) {
        return {
          ok: true,
          value: createJob({
            id: 'job-retry',
            status: 'running',
            input: {
              _workflowName: 'provider-generate',
              originJobId: jobId,
            },
          }),
        };
      },
      getJob(jobId: string) {
        return createJob({
          id: jobId,
          status: 'running',
          input: { _workflowName: 'provider-generate' },
        });
      },
      subscribeJobEvents(handler: JobEventHandler): Unsubscribe {
        listeners.add(handler);
        return () => {
          listeners.delete(handler);
          unsubscribe();
        };
      },
    },
    emit(event: JobEvent) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    unsubscribe,
  };
}

describe('createImagenSession', () => {
  it('publishes an initial snapshot and projects completed submit results', async () => {
    const { commands } = createCommands();
    const session = createImagenSession({ commands });
    const snapshots: ImagenSessionSnapshot[] = [];

    session.subscribe((snapshot) => snapshots.push(snapshot));

    expect(snapshots).toEqual([{ jobs: [] }]);

    const result = await session.submitJob({
      workflow: 'provider-generate',
      input: {
        profileId: 'mock-profile',
        prompt: 'make an image',
        providerOptions: { model: 'mock-image-v1' },
      },
    });

    expect(result.ok).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      selectedProfileId: 'mock-profile',
      selectedModelId: 'mock-image-v1',
      jobs: [
        {
          id: 'job-completed',
          type: 'generate',
          status: 'completed',
          phase: 'completed',
          canRetry: false,
          canCancel: false,
        },
      ],
    });
    expect(session.getSnapshot().activeJobId).toBeUndefined();
    expect(snapshots).toHaveLength(2);
  });

  it('projects lifecycle events and failed job errors without inventing cancel support', () => {
    const { commands, emit, unsubscribe } = createCommands();
    const session = createImagenSession({ commands });

    emit({
      type: 'running',
      job: createJob({
        id: 'job-running',
        status: 'running',
        input: {
          _workflowName: 'provider-edit',
          providerProfileId: 'edit-profile',
        },
      }),
    });

    expect(session.getSnapshot()).toMatchObject({
      selectedProfileId: 'edit-profile',
      activeJobId: 'job-running',
      jobs: [
        {
          id: 'job-running',
          type: 'edit',
          status: 'running',
          phase: 'running',
          canRetry: false,
          canCancel: false,
        },
      ],
    });

    emit({
      type: 'failed',
      job: createJob({
        id: 'job-running',
        status: 'failed',
        input: {
          _workflowName: 'provider-edit',
          providerProfileId: 'edit-profile',
        },
        error: {
          category: 'runtime',
          message: 'failed job',
        },
      }),
    });

    expect(session.getSnapshot()).toMatchObject({
      lastError: {
        category: 'runtime',
        message: 'failed job',
      },
      jobs: [
        {
          id: 'job-running',
          type: 'edit',
          status: 'failed',
          canRetry: true,
          canCancel: false,
        },
      ],
    });
    expect(session.getSnapshot().activeJobId).toBeUndefined();

    session.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

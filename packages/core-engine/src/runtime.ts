/**
 * Create the shared runtime.
 *
 * INTENT: Orchestrate job lifecycle, workflow execution, and lifecycle events
 * INPUT: RuntimeOptions
 * OUTPUT: Runtime
 * SIDE EFFECT: Mutates in-memory job store and emits lifecycle events
 * FAILURE: Persists structured failures on job records and rethrows command validation errors
 */

import { createJobError, providerError, validationError } from "./errors.js";
import { createJobEventBus } from "./events.js";
import { runWorkflow } from "./runner.js";
import { createJobStore } from "./store.js";
import type { AssetDescriptor } from "./types/assets.js";
import type { JobError } from "./types/errors.js";
import type { JobEventPayload, JobEventType, JobRecord, JobRequest, JobStatus, JobTerminalResult } from "./types/job.js";
import type { Runtime, RuntimeOptions } from "./types/runtime.js";

export function createRuntime(options: RuntimeOptions): Runtime {
  const store = createJobStore();
  const events = createJobEventBus();
  const now = options.now ?? defaultNow;
  const createJobId = createJobIdFactory(options.createJobId);

  return {
    async submitJob(request) {
      const created = createInitialRecord(createJobId(), request, now());
      const stored = store.put(created);

      emitLifecycleEvent(events, "job:created", stored);
      scheduleExecution(stored.jobId);

      return stored;
    },
    getJob(jobId) {
      return store.get(jobId);
    },
    async retryJob(jobId) {
      const record = requireJob(store.get(jobId), jobId);
      if (record.status !== "failed") {
        throw validationError("job_not_retryable", `Job "${jobId}" is not in failed state.`);
      }

      return this.submitJob({
        ...record.request,
        metadata: {
          ...(record.request.metadata ?? {}),
          retryOf: jobId,
        },
      });
    },
    subscribe(listener) {
      return events.subscribe(listener);
    },
  };

  function scheduleExecution(jobId: string): void {
    void Promise.resolve()
      .then(async () => {
        await executeJob(jobId);
      })
      .catch(() => {
        // executeJob persists terminal failures; this guard keeps the microtask chain quiet.
      });
  }

  async function executeJob(jobId: string): Promise<void> {
    try {
      const request = requireJob(store.get(jobId), jobId).request;
      const result = await runWorkflow({
        request,
        workflowRegistry: options.workflowRegistry,
        providerDispatcher: options.providerDispatcher,
        onStepStart(stepId, workflowId) {
          const running = updateJobRecord(store, jobId, now(), {
            status: "running",
            activeStepId: stepId,
          });
          emitLifecycleEvent(events, "job:running", running, { workflowId, stepId });
        },
      });

      const completed = updateJobRecord(store, jobId, now(), {
        status: "completed",
        activeStepId: result.lastStepId,
        result: toTerminalResult(result),
        error: null,
      });
      emitLifecycleEvent(events, "job:completed", completed, { workflowId: request.workflowId ?? null });
    } catch (error) {
      const failed = updateJobRecord(store, jobId, now(), {
        status: "failed",
        activeStepId: null,
        result: null,
        error: toJobError(error),
      });
      emitLifecycleEvent(events, "job:failed", failed);
    }
  }
}

function createInitialRecord(jobId: string, request: JobRequest, timestamp: string): JobRecord {
  return {
    jobId,
    status: "created",
    request,
    activeStepId: null,
    eventSequence: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    result: null,
    error: null,
  };
}

function updateJobRecord(
  store: ReturnType<typeof createJobStore>,
  jobId: string,
  timestamp: string,
  patch: {
    readonly status: JobStatus;
    readonly activeStepId: string | null;
    readonly result?: JobTerminalResult | null;
    readonly error?: JobError | null;
  },
): JobRecord {
  return store.update(jobId, (record) => ({
    ...record,
    status: patch.status,
    activeStepId: patch.activeStepId,
    eventSequence: record.eventSequence + 1,
    updatedAt: timestamp,
    ...(patch.result !== undefined && { result: patch.result }),
    ...(patch.error !== undefined && { error: patch.error }),
  }));
}

function emitLifecycleEvent(
  events: ReturnType<typeof createJobEventBus>,
  type: JobEventType,
  record: JobRecord,
  diagnostics?: Record<string, unknown>,
): void {
  const payload: JobEventPayload = {
    jobId: record.jobId,
    status: record.status,
    timestamp: record.updatedAt,
    sequence: record.eventSequence,
    activeStepId: record.activeStepId,
    summary: {
      providerId: record.request.providerId,
      workflowId: record.request.workflowId ?? record.request.workflowSpec?.id ?? null,
    },
    ...(diagnostics !== undefined && { diagnostics }),
  };

  events.emit({
    type,
    payload,
    record,
  });
}

function toTerminalResult(result: {
  readonly output: unknown;
  readonly assets: readonly AssetDescriptor[];
  readonly diagnostics?: Record<string, unknown>;
}): JobTerminalResult {
  return {
    output: result.output,
    assets: result.assets,
    ...(result.diagnostics !== undefined && { diagnostics: result.diagnostics }),
  };
}

function requireJob(record: JobRecord | undefined, jobId: string): JobRecord {
  if (!record) {
    throw validationError("unknown_job", `Job "${jobId}" does not exist.`);
  }

  return record;
}

function toJobError(error: unknown): JobError {
  if (isJobError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return providerError("unknown_provider_error", error.message, {
      name: error.name,
    });
  }

  return createJobError("provider_error", "unknown_provider_error", "Unknown provider failure.", {
    value: String(error),
  });
}

function isJobError(error: unknown): error is JobError {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    typeof (error as JobError).code === "string" &&
    typeof (error as JobError).category === "string" &&
    typeof (error as JobError).message === "string"
  );
}

function createJobIdFactory(createJobId?: () => string): () => string {
  if (createJobId) {
    return createJobId;
  }

  let sequence = 0;

  return () => {
    sequence += 1;
    return `job-${Date.now()}-${sequence}`;
  };
}

function defaultNow(): string {
  return new Date().toISOString();
}

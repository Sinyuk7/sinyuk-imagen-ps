/**
 * In-memory job store 与状态机实现。
 *
 * `createJobStore()` 返回 `{ store, controller }`：
 * - `store` 对外提供读取与创建能力（`submitJob`、`getJob`、`retryJob`）。
 * - `controller` 仅由 runner / runtime 内部使用，提供状态推进能力。
 *
 * 所有对外返回值为 immutable snapshot，与内部 mutable record 隔离。
 */

import type {
  Job,
  JobAttemptMetadata,
  JobStore,
  JobStoreController,
  JobInput,
  JobOutput,
  JobStatus,
} from './types/job.js';
import type { JobError } from './errors.js';
import { createExecutionError, createValidationError, createRuntimeError } from './errors.js';
import { assertNoSecrets, createImmutableSnapshot } from './invariants.js';

/**
 * 内部可变的 job record。
 *
 * 与对外 `Job` 接口字段一致，但去掉 `readonly` 修饰，供 store 内部修改。
 */
type InternalJobRecord = {
  id: string;
  status: JobStatus;
  input: JobInput;
  output: JobOutput | undefined;
  error: JobError | undefined;
  createdAt: string;
  updatedAt: string;
  originJobId?: string;
  retryAttempt?: number;
};

/** 状态迁移表。terminal state（completed、failed）不允许再迁移。 */
const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  created: ['running'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};

/**
 * 校验状态迁移是否合法。
 *
 * @throws `JobError`（`category: 'runtime'`）当迁移非法时
 */
function assertTransition(from: JobStatus, to: JobStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw createRuntimeError(
      `Illegal state transition from '${from}' to '${to}'.`,
      { from, to },
    );
  }
}

/**
 * 生成唯一 job id。
 *
 * 优先使用 `crypto.randomUUID()`，若不可用则 fallback 到
 * `timestamp + counter + random suffix`。
 */
function makeIdGenerator() {
  let counter = 0;
  return function generateId(): string {
    try {
      const g = globalThis as typeof globalThis & { crypto?: { randomUUID(): string } };
      if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return g.crypto.randomUUID();
      }
    } catch {
      // fallback to manual id generation
    }
    return `${Date.now()}_${++counter}_${Math.random().toString(36).slice(2, 8)}`;
  };
}

/**
 * 将内部 mutable record 转换为对外 immutable snapshot。
 *
 * 使用 deep clone + freeze 确保外部无法修改内部状态或 binary bytes。
 */
function toSnapshot(record: InternalJobRecord): Job {
  return createImmutableSnapshot(record) as Job;
}

/**
 * 获取当前 ISO 8601 时间戳。
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * 创建一对配对的 `JobStore` 与 `JobStoreController`。
 *
 * @returns `{ store, controller }` — `store` 对外可读可创建，`controller` 仅供内部推进状态
 */
export function createJobStore(): { store: JobStore; controller: JobStoreController } {
  const jobs = new Map<string, InternalJobRecord>();
  const generateId = makeIdGenerator();

  const store: JobStore = {
    submitJob(input: JobInput, attempt?: JobAttemptMetadata): Job {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw createValidationError('Job input must be a record.');
      }
      assertNoSecrets(input);
      if (
        attempt !== undefined
        && (
          typeof attempt.originJobId !== 'string'
          || attempt.originJobId.trim().length === 0
          || !Number.isInteger(attempt.retryAttempt)
          || attempt.retryAttempt <= 0
        )
      ) {
        throw createValidationError('Job attempt metadata is invalid.');
      }
      const inputSnapshot = createImmutableSnapshot(input) as JobInput;
      const id = generateId();
      const ts = now();
      const record: InternalJobRecord = {
        id,
        status: 'created',
        input: inputSnapshot,
        output: undefined,
        error: undefined,
        createdAt: ts,
        updatedAt: ts,
        ...(attempt !== undefined ? {
          originJobId: attempt.originJobId,
          retryAttempt: attempt.retryAttempt,
        } : {}),
      };
      jobs.set(id, record);
      return toSnapshot(record);
    },

    getJob(id: string): Job | undefined {
      const record = jobs.get(id);
      if (!record) {
        return undefined;
      }
      return toSnapshot(record);
    },

    retryJob(id: string): Job {
      const original = jobs.get(id);
      if (!original) {
        throw createValidationError(`Job "${id}" not found.`, { id });
      }
      if (original.status !== 'failed') {
        throw createValidationError(
          `Cannot retry job "${id}" because its status is "${original.status}" (expected "failed").`,
          { id, status: original.status },
        );
      }
      const newId = generateId();
      const ts = now();
      const record: InternalJobRecord = {
        id: newId,
        status: 'created',
        input: createImmutableSnapshot(original.input) as JobInput,
        output: undefined,
        error: undefined,
        createdAt: ts,
        updatedAt: ts,
        originJobId: original.id,
        retryAttempt: (original.retryAttempt ?? 0) + 1,
      };
      jobs.set(newId, record);
      return toSnapshot(record);
    },
  };

  const controller: JobStoreController = {
    markRunning(id: string): Job {
      const record = jobs.get(id);
      if (!record) {
        throw createValidationError(`Job "${id}" not found.`, { id });
      }
      assertTransition(record.status, 'running');
      record.status = 'running';
      record.updatedAt = now();
      return toSnapshot(record);
    },

    markCompleted(id: string, output: JobOutput): Job {
      const record = jobs.get(id);
      if (!record) {
        throw createValidationError(`Job "${id}" not found.`, { id });
      }
      assertTransition(record.status, 'completed');
      let outputSnapshot: JobOutput;
      try {
        if (typeof output !== 'object' || output === null || Array.isArray(output)) {
          throw createExecutionError('Job terminal output must be a record.', { id });
        }
        assertNoSecrets(output);
        outputSnapshot = createImmutableSnapshot(output) as JobOutput;
      } catch {
        throw createExecutionError('Job terminal output failed boundary validation.', { id });
      }
      record.status = 'completed';
      record.output = outputSnapshot;
      record.updatedAt = now();
      return toSnapshot(record);
    },

    markFailed(id: string, error: JobError): Job {
      const record = jobs.get(id);
      if (!record) {
        throw createValidationError(`Job "${id}" not found.`, { id });
      }
      assertTransition(record.status, 'failed');
      let errorSnapshot: JobError;
      try {
        assertNoSecrets(error);
        errorSnapshot = createImmutableSnapshot(error) as JobError;
      } catch {
        errorSnapshot = createExecutionError('Execution failed with an invalid error payload.', { id });
      }
      record.status = 'failed';
      record.error = errorSnapshot;
      record.updatedAt = now();
      return toSnapshot(record);
    },
  };

  return { store, controller };
}

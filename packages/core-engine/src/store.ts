/**
 * In-memory job store 与状态机实现。
 *
 * `createJobStore()` 返回 `{ store, controller }`：
 * - `store` 对外提供读取与创建能力（`submitJob`、`getJob`、`retryJob`）。
 * - `controller` 仅由 runner / runtime 内部使用，提供状态推进能力。
 *
 * 所有对外返回值为 immutable snapshot，与内部 mutable record 隔离。
 */

import type { Job, JobStore, JobStoreController, JobInput, JobOutput, JobStatus } from './types/job.js';
import type { JobError } from './errors.js';
import { createValidationError, createRuntimeError } from './errors.js';
import { assertSerializable, assertImmutable } from './invariants.js';

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
 * 使用浅 clone + `assertImmutable` 确保外部无法直接修改内部状态。
 */
function toSnapshot(record: InternalJobRecord): Job {
  const snapshot: InternalJobRecord = { ...record };
  return assertImmutable(snapshot) as unknown as Job;
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
    submitJob(input: JobInput): Job {
      assertSerializable(input);
      const id = generateId();
      const ts = now();
      const record: InternalJobRecord = {
        id,
        status: 'created',
        input,
        output: undefined,
        error: undefined,
        createdAt: ts,
        updatedAt: ts,
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
        input: original.input,
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
      record.status = 'completed';
      record.output = output;
      record.updatedAt = now();
      return toSnapshot(record);
    },

    markFailed(id: string, error: JobError): Job {
      const record = jobs.get(id);
      if (!record) {
        throw createValidationError(`Job "${id}" not found.`, { id });
      }
      assertTransition(record.status, 'failed');
      record.status = 'failed';
      record.error = error;
      record.updatedAt = now();
      return toSnapshot(record);
    },
  };

  return { store, controller };
}

import {
  assertNoSecrets,
  createImmutableSnapshot,
  createValidationError,
} from '@imagen-ps/core-engine';
import { assertTaskRecord } from '../task.js';
import type {
  AdmittedGeneration,
  GenerationBackend,
  GenerationCommand,
} from './types.js';

const COMMAND_KEYS = ['taskId', 'backendId', 'payload'] as const;
const ADMISSION_KEYS = ['taskId', 'backendId', 'execution', 'runningTask', 'lane', 'retry'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw createValidationError(`${path} must be a record.`, { path });
  }
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw createValidationError(`${path} contains unsupported field "${key}".`, {
        path: `${path}.${key}`,
      });
    }
  }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createValidationError(`${path} must be a non-empty string.`, { path });
  }
}

function assertNoMutableBinary(value: unknown, seen = new WeakSet<object>(), path = 'root'): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    throw createValidationError(`Generation boundary contains raw binary at "${path}".`, { path });
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoMutableBinary(item, seen, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assertNoMutableBinary(child, seen, `${path}.${key}`);
  }
}

function immutableBoundarySnapshot<T>(value: T): T {
  assertNoMutableBinary(value);
  assertNoSecrets(value);
  return createImmutableSnapshot(value) as T;
}

/** 校验并冻结 GenerationCommand，隔离 caller-owned mutable state。 */
export function normalizeGenerationCommand(command: GenerationCommand): GenerationCommand {
  assertRecord(command, 'GenerationCommand');
  assertAllowedKeys(command, COMMAND_KEYS, 'GenerationCommand');
  assertNonEmptyString(command.taskId, 'GenerationCommand.taskId');
  assertNonEmptyString(command.backendId, 'GenerationCommand.backendId');
  assertRecord(command.payload, 'GenerationCommand.payload');
  return immutableBoundarySnapshot(command);
}

/**
 * 校验并冻结 backend admission。
 *
 * 必须在 queue publication 前调用；失败不得产生 Task、Job 或 remote side effect。
 */
export function normalizeAdmittedGeneration(
  command: GenerationCommand,
  backendId: string,
  admitted: AdmittedGeneration,
): AdmittedGeneration {
  const normalizedCommand = normalizeGenerationCommand(command);
  assertNonEmptyString(backendId, 'GenerationBackend.id');
  if (normalizedCommand.backendId !== backendId) {
    throw createValidationError('GenerationCommand.backendId does not match GenerationBackend.id.', {
      commandBackendId: normalizedCommand.backendId,
      backendId,
    });
  }

  assertRecord(admitted, 'AdmittedGeneration');
  assertAllowedKeys(admitted, ADMISSION_KEYS, 'AdmittedGeneration');
  if (admitted.taskId !== normalizedCommand.taskId) {
    throw createValidationError('AdmittedGeneration.taskId does not match GenerationCommand.taskId.', {
      commandTaskId: normalizedCommand.taskId,
      admittedTaskId: admitted.taskId,
    });
  }
  if (admitted.backendId !== backendId) {
    throw createValidationError('AdmittedGeneration.backendId does not match GenerationBackend.id.', {
      admittedBackendId: admitted.backendId,
      backendId,
    });
  }

  assertRecord(admitted.execution, 'AdmittedGeneration.execution');
  assertAllowedKeys(admitted.execution, ['workflow', 'input'], 'AdmittedGeneration.execution');
  assertNonEmptyString(admitted.execution.workflow, 'AdmittedGeneration.execution.workflow');
  assertRecord(admitted.execution.input, 'AdmittedGeneration.execution.input');

  assertTaskRecord(admitted.runningTask);
  if (admitted.runningTask.taskId !== admitted.taskId) {
    throw createValidationError('AdmittedGeneration.runningTask.taskId does not match admission taskId.', {
      admittedTaskId: admitted.taskId,
      runningTaskId: admitted.runningTask.taskId,
    });
  }
  if (admitted.runningTask.status !== 'running') {
    throw createValidationError('AdmittedGeneration.runningTask must have status "running".', {
      taskId: admitted.taskId,
      status: admitted.runningTask.status,
    });
  }
  if (admitted.runningTask.latestJobId !== undefined) {
    throw createValidationError('AdmittedGeneration.runningTask must not have latestJobId before Job creation.', {
      taskId: admitted.taskId,
    });
  }

  if (admitted.lane !== undefined) {
    assertRecord(admitted.lane, 'AdmittedGeneration.lane');
    assertAllowedKeys(admitted.lane, ['key', 'maxConcurrency'], 'AdmittedGeneration.lane');
    assertNonEmptyString(admitted.lane.key, 'AdmittedGeneration.lane.key');
    if (!Number.isInteger(admitted.lane.maxConcurrency) || admitted.lane.maxConcurrency <= 0) {
      throw createValidationError('AdmittedGeneration.lane.maxConcurrency must be a positive integer.', {
        maxConcurrency: admitted.lane.maxConcurrency,
      });
    }
  }

  assertRecord(admitted.retry, 'AdmittedGeneration.retry');
  assertAllowedKeys(admitted.retry, ['allowed', 'reason'], 'AdmittedGeneration.retry');
  if (typeof admitted.retry.allowed !== 'boolean') {
    throw createValidationError('AdmittedGeneration.retry.allowed must be a boolean.');
  }
  if (admitted.retry.reason !== undefined) {
    assertNonEmptyString(admitted.retry.reason, 'AdmittedGeneration.retry.reason');
    if (admitted.retry.allowed) {
      throw createValidationError('Allowed retry policy must not include a denial reason.');
    }
  }

  return immutableBoundarySnapshot(admitted);
}

/** 执行 backend admission，并在返回 queue 前统一应用 contract normalization。 */
export async function admitGeneration(
  backend: GenerationBackend,
  command: GenerationCommand,
): Promise<AdmittedGeneration> {
  if (typeof backend !== 'object' || backend === null || typeof backend.admit !== 'function') {
    throw createValidationError('GenerationBackend must define admit().');
  }
  assertNonEmptyString(backend.id, 'GenerationBackend.id');
  const normalizedCommand = normalizeGenerationCommand(command);
  if (normalizedCommand.backendId !== backend.id) {
    throw createValidationError('GenerationCommand.backendId does not match GenerationBackend.id.', {
      commandBackendId: normalizedCommand.backendId,
      backendId: backend.id,
    });
  }
  const admitted = await backend.admit(normalizedCommand);
  return normalizeAdmittedGeneration(normalizedCommand, backend.id, admitted);
}

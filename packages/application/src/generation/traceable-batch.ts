import { createValidationError } from '@imagen-ps/core-engine';
import { ActiveSlotAdmission, DEFAULT_ACTIVE_SLOTS, type GenerationBatch } from '../traceable-generation.js';

/** Batch admission 的明确拒绝错误。 */
export class BatchCapacityError extends Error {
  readonly code = 'capacity-unavailable';
}

/** 不创建 pending queue 的 batch admission 端口。 */
export interface BatchDispatcher<TInput, TResult> {
  dispatch(input: TInput, signal: AbortSignal): Promise<TResult>;
}

/** child task 的独立执行句柄。 */
export interface ChildExecution<TResult> {
  readonly taskId: string;
  readonly promise: Promise<TResult>;
  cancel(): void;
}

/** Batch 执行结果；单个 child 的失败不会影响同批其他 child。 */
export interface BatchExecution<TResult> {
  readonly batch: GenerationBatch;
  readonly children: readonly ChildExecution<TResult>[];
  cancel(taskId: string): boolean;
  release(): void;
}

/** 原子预留整批容量并独立 dispatch child tasks。 */
export function createBatchExecution<TInput, TResult>(args: {
  readonly batchId: string;
  readonly inputs: readonly { readonly taskId: string; readonly input: TInput }[];
  readonly admission?: ActiveSlotAdmission;
  readonly dispatch: BatchDispatcher<TInput, TResult> | ((input: TInput, signal: AbortSignal) => Promise<TResult>);
  readonly createdAt?: string;
}): BatchExecution<TResult> {
  if (args.inputs.length === 0) throw createValidationError('Batch must contain at least one child task.');
  const admission = args.admission ?? new ActiveSlotAdmission(DEFAULT_ACTIVE_SLOTS);
  let reservation;
  try { reservation = admission.reserve(args.inputs.length); } catch (error) {
    throw new BatchCapacityError(error instanceof Error ? error.message : 'Please wait for active generation capacity.');
  }
  const batch: GenerationBatch = { batchId: args.batchId, taskIds: args.inputs.map((item) => item.taskId), createdAt: args.createdAt ?? new Date().toISOString() };
  const children: ChildExecution<TResult>[] = args.inputs.map((item) => {
    const controller = new AbortController();
    let cancelled = false;
    const dispatch = typeof args.dispatch === 'function' ? args.dispatch : args.dispatch.dispatch.bind(args.dispatch);
    const promise = dispatch(item.input, controller.signal).catch((error) => {
      if (cancelled) throw error;
      throw error;
    });
    return { taskId: item.taskId, promise, cancel: () => { if (!cancelled) { cancelled = true; controller.abort(); } } };
  });
  let released = false;
  return {
    batch,
    children,
    cancel(taskId) { const child = children.find((candidate) => candidate.taskId === taskId); if (!child) return false; child.cancel(); return true; },
    release() { if (!released) { released = true; reservation.release(); } },
  };
}

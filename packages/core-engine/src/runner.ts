/** Workflow runner：顺序执行 execution step，支持 binding 与 immutable handoff。 */

import type { Job, JobOutput, JobStoreController } from './types/job.js';
import type { WorkflowRegistry } from './types/workflow.js';
import type { ExecutionDispatcher, ExecutionRef } from './types/execution.js';
import type { ErrorCategory, JobError } from './errors.js';
import { createExecutionError, createWorkflowError } from './errors.js';
import { assertNoSecrets, createImmutableSnapshot } from './invariants.js';
import type { Logger } from '@imagen-ps/foundation';
import { createNullLogger } from '@imagen-ps/foundation';

const ERROR_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  'validation',
  'execution',
  'provider',
  'runtime',
  'workflow',
  'unknown',
]);

/** Runner 执行所需的最小依赖集合。 */
export interface RunnerDeps {
  /** Workflow 查找表。 */
  registry: WorkflowRegistry;

  /** Job 状态推进器。 */
  controller: JobStoreController;

  /** Backend-neutral execution 调用抽象。 */
  dispatcher: ExecutionDispatcher;

  /** 可选 Logger；未提供时使用 null logger。 */
  logger?: Logger;

  /** 可选取消信号；execution dispatch 前后协作检查。 */
  signal?: AbortSignal;

  /** 可选 step result 后处理；在结果进入 handoff/store 前执行。 */
  afterStepResult?(args: {
    readonly workflowName: string;
    readonly stepName: string;
    readonly outputKey: string;
    readonly result: unknown;
  }): Promise<unknown> | unknown;
}

function isJobError(error: unknown): error is JobError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as Partial<JobError>;
  return (
    typeof candidate.category === 'string' &&
    ERROR_CATEGORIES.has(candidate.category as ErrorCategory) &&
    typeof candidate.message === 'string'
  );
}

function toRunnerError(error: unknown, phase: string): JobError {
  if (isJobError(error)) {
    try {
      assertNoSecrets(error);
      return createImmutableSnapshot(error) as JobError;
    } catch {
      return createExecutionError('Execution failed with an invalid structured error.', { phase });
    }
  }

  if (error instanceof Error) {
    return createExecutionError('Workflow execution failed.', { phase, name: error.name });
  }

  return createExecutionError('Workflow execution failed.', { phase });
}

function resolveValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const match = value.match(/^\$\{([^}]+)\}$/);
    if (match) {
      const key = match[1];
      if (key in context) {
        return context[key];
      }
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, context));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = resolveValue(child, context);
    }
    return result;
  }

  return value;
}

function resolveStepInput(
  input: Record<string, unknown> | undefined,
  context: Record<string, unknown>,
  workflowName: string,
  stepName: string,
): Record<string, unknown> {
  try {
    return resolveValue(input ?? {}, context) as Record<string, unknown>;
  } catch {
    throw createWorkflowError(`Workflow "${workflowName}" step "${stepName}" binding resolution failed.`, {
      workflowName,
      stepName,
    });
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createExecutionError('Workflow execution was aborted.', { reason: 'abort-signal' });
  }
}

function snapshotStepResult(
  value: unknown,
  workflowName: string,
  stepName: string,
): unknown {
  try {
    assertNoSecrets(value);
    return createImmutableSnapshot(value);
  } catch {
    throw createExecutionError('Step result failed boundary validation.', {
      workflowName,
      stepName,
    });
  }
}

/**
 * 执行指定 workflow 的全部 execution steps。
 *
 * Runner 只使用 static `step.adapter` 路由，按声明顺序发布 immutable output。
 */
export async function executeWorkflow(job: Job, workflowName: string, deps: RunnerDeps): Promise<Job> {
  const { registry, controller, dispatcher } = deps;
  const logger = deps.logger ?? createNullLogger();
  const runnerLogger = logger.child({ package: 'core-engine', component: 'runner' });

  controller.markRunning(job.id);

  const workflow = registry.get(workflowName);
  if (!workflow) {
    return controller.markFailed(
      job.id,
      createWorkflowError(`Workflow "${workflowName}" not found.`, { workflowName }),
    );
  }

  const context: Record<string, unknown> = { ...job.input };

  try {
    for (const step of workflow.steps) {
      throwIfAborted(deps.signal);
      if (step.kind !== 'execution') {
        throw createWorkflowError(
          `Workflow "${workflowName}" step "${step.name}" must use kind "execution".`,
          { workflowName, stepName: step.name, kind: step.kind },
        );
      }

      const stepLogger = runnerLogger.child({ workflow: workflowName });
      const span = stepLogger.startSpan('runner.step', { stepName: step.name, adapter: step.adapter });

      try {
        const resolvedInput = resolveStepInput(step.input, context, workflowName, step.name);
        const ref: ExecutionRef = {
          adapter: step.adapter,
          params: resolvedInput,
        };
        const outputKey = step.outputKey ?? step.name;
        const result = await dispatcher.dispatch(ref, {
          jobId: job.id,
          logger: stepLogger.child({ span_id: span.span_id }),
          ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
        });
        throwIfAborted(deps.signal);

        let processedResult = result;
        if (deps.afterStepResult !== undefined) {
          try {
            processedResult = await deps.afterStepResult({
              workflowName,
              stepName: step.name,
              outputKey,
              result,
            });
          } catch (error) {
            throw toRunnerError(error, 'after-step-result');
          }
        }

        throwIfAborted(deps.signal);
        context[outputKey] = snapshotStepResult(processedResult, workflowName, step.name);
        span.finish();
      } catch (error) {
        const mapped = toRunnerError(error, 'step');
        span.fail(mapped);
        throw mapped;
      }
    }

    throwIfAborted(deps.signal);
    const candidate = { ...context };
    assertNoSecrets(candidate);
    const output = createImmutableSnapshot(candidate) as JobOutput;
    return controller.markCompleted(job.id, output);
  } catch (error) {
    return controller.markFailed(job.id, toRunnerError(error, 'workflow'));
  }
}

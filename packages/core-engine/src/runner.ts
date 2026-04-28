/**
 * Workflow runner —— 顺序执行 workflow step，支持 input binding 与 output handoff。
 *
 * 当前仅支持 `provider` step；`transform` / `io` 视为保留值，不具执行语义。
 */

import type { Job, JobOutput, JobStoreController } from './types/job.js';
import type { WorkflowRegistry } from './types/workflow.js';
import type { ProviderDispatcher, ProviderRef } from './types/provider.js';
import type { JobError } from './errors.js';
import { createWorkflowError, createRuntimeError } from './errors.js';
import { assertImmutable } from './invariants.js';

/** Runner 执行所需的最小依赖集合。 */
export interface RunnerDeps {
  /** Workflow 查找表。 */
  registry: WorkflowRegistry;

  /** Job 状态推进器。 */
  controller: JobStoreController;

  /** Provider 调用抽象。 */
  dispatcher: ProviderDispatcher;
}

// ------------------------------------------------------------------
// 错误判断
// ------------------------------------------------------------------

function isJobError(error: unknown): error is JobError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'category' in error &&
    typeof (error as JobError).category === 'string' &&
    'message' in error &&
    typeof (error as JobError).message === 'string'
  );
}

// ------------------------------------------------------------------
// Input binding 解析
// ------------------------------------------------------------------

/**
 * 递归解析值中的 binding 占位符。
 *
 * 字符串值若完全匹配 `${key}` 格式：
 * - 若 `key` 存在于上下文中，替换为上下文中的原始值（保留类型）；
 * - 若 `key` 不存在，按字面量保留原字符串，让 provider/request validation 处理缺失输入。
 *
 * 字符串中"部分包含" `${...}` 子串（非整体匹配）的情况一律视为字面量保留，
 * 不做解析也不报错——这是为了允许 provider 自身的模板语法穿透。
 *
 * 对象与数组递归处理。
 */
function resolveValue(value: unknown, context: Record<string, unknown>, path: string): unknown {
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
    return value.map((v, i) => resolveValue(v, context, `${path}[${i}]`));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveValue(v, context, `${path}.${k}`);
    }
    return result;
  }

  return value;
}

/** 将 step input 中的 binding 解析为实际值。 */
function resolveStepInput(
  input: Record<string, unknown> | undefined,
  context: Record<string, unknown>,
  stepName: string,
): Record<string, unknown> {
  return resolveValue(input ?? {}, context, `step("${stepName}").input`) as Record<string, unknown>;
}

// ------------------------------------------------------------------
// Step 执行
// ------------------------------------------------------------------

/**
 * 执行单个 `provider` step。
 *
 * @throws `JobError` 当 dispatch 失败或 step 结构不合法时
 */
async function executeProviderStep(
  step: { readonly name: string; readonly input?: Record<string, unknown>; readonly outputKey?: string },
  context: Record<string, unknown>,
  dispatcher: ProviderDispatcher,
): Promise<void> {
  const resolvedInput = resolveStepInput(step.input, context, step.name);
  const provider = (resolvedInput.provider as string) ?? step.name;

  const ref: ProviderRef = {
    provider,
    params: resolvedInput,
  };

  const result = await dispatcher.dispatch(ref);

  const outputKey = step.outputKey ?? step.name;
  context[outputKey] = assertImmutable(result);
}

// ------------------------------------------------------------------
// Workflow 执行
// ------------------------------------------------------------------

/**
 * 执行指定 workflow 的全部 step。
 *
 * 执行流程：
 * 1. 通过 `registry` 查找 workflow；未命中则 markFailed
 * 2. markRunning
 * 3. 顺序执行每个 `provider` step（input binding → dispatch → output handoff）
 * 4. markCompleted（成功）或 markFailed（失败）
 *
 * @param job - 已创建的 job（status 应为 `'created'`）
 * @param workflowName - 要执行的 workflow 名称
 * @param deps - runner 依赖
 * @returns 执行完成后（completed 或 failed）的 job snapshot
 */
export async function executeWorkflow(job: Job, workflowName: string, deps: RunnerDeps): Promise<Job> {
  const { registry, controller, dispatcher } = deps;

  controller.markRunning(job.id);

  const workflow = registry.get(workflowName);
  if (!workflow) {
    const error = createWorkflowError(`Workflow "${workflowName}" not found.`, {
      workflowName,
    });
    return controller.markFailed(job.id, error);
  }

  const context: Record<string, unknown> = { ...job.input };

  try {
    for (const step of workflow.steps) {
      if (step.kind !== 'provider') {
        throw createWorkflowError(
          `Unsupported step kind "${step.kind}" in step "${step.name}". Only "provider" steps are currently supported.`,
          { workflowName, stepName: step.name, kind: step.kind },
        );
      }

      await executeProviderStep(step, context, dispatcher);
    }

    const output = assertImmutable({ ...context }) as JobOutput;
    return controller.markCompleted(job.id, output);
  } catch (error) {
    const jobError = isJobError(error)
      ? error
      : createRuntimeError(error instanceof Error ? error.message : String(error));
    return controller.markFailed(job.id, jobError);
  }
}

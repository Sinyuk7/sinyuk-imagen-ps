/**
 * Workflow registry 实现。
 *
 * 负责保存 declarative workflow specs，并提供按名查找能力。
 * 不承担执行逻辑，也不理解 provider 语义。
 */

import { createWorkflowError } from './errors.js';
import { assertImmutable, assertSerializable } from './invariants.js';
import type { Step, Workflow, WorkflowRegistry } from './types/workflow.js';

/** 合法的 StepKind 集合，用于运行时校验。 */
const VALID_STEP_KINDS: readonly string[] = ['provider', 'transform', 'io'];

/**
 * 对 workflow step 做最小 shape 收敛。
 *
 * 当前只校验最基本的标识字段，不扩展为完整 schema 系统。
 */
function normalizeStep(step: Step, workflowName: string, index: number): Step {
  const stepName = step.name;

  if (typeof stepName !== 'string' || stepName.trim().length === 0) {
    throw createWorkflowError(
      `Workflow "${workflowName}" has a step with an empty or invalid name.`,
      { workflowName, stepIndex: index },
    );
  }

  if (!VALID_STEP_KINDS.includes(step.kind)) {
    throw createWorkflowError(
      `Workflow "${workflowName}" step "${step.name}" has an invalid kind "${step.kind}".`,
      { workflowName, stepName: step.name, stepIndex: index, kind: step.kind },
    );
  }

  if (step.outputKey !== undefined && step.outputKey.trim().length === 0) {
    throw createWorkflowError(
      `Workflow "${workflowName}" step "${step.name}" has an empty outputKey.`,
      { workflowName, stepName: step.name, stepIndex: index },
    );
  }

  if (step.input !== undefined) {
    assertSerializable(step.input);
  }

  return assertImmutable({
    name: step.name,
    kind: step.kind,
    input: step.input === undefined ? undefined : assertImmutable({ ...step.input }),
    outputKey: step.outputKey,
  }) as Step;
}

/**
 * 复制并冻结 workflow，确保 registry 内部与调用方隔离。
 */
function normalizeWorkflow(workflow: Workflow): Workflow {
  const name = workflow.name;

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw createWorkflowError('Workflow name must be a non-empty string.', {
      workflowName: name,
    });
  }

  const steps = workflow.steps.map((step, index) =>
    normalizeStep(step, workflow.name, index),
  );

  return assertImmutable({
    name: workflow.name,
    version: workflow.version,
    steps: assertImmutable(steps),
  }) as Workflow;
}

/**
 * 创建 workflow registry。
 *
 * @param initialWorkflows - 可选初始 builtin workflows
 */
export function createWorkflowRegistry(
  initialWorkflows: readonly Workflow[] = [],
): WorkflowRegistry {
  const workflows = new Map<string, Workflow>();

  const registry: WorkflowRegistry = {
    register(workflow: Workflow): Workflow {
      assertSerializable(workflow);
      const snapshot = normalizeWorkflow(workflow);
      if (workflows.has(snapshot.name)) {
        throw createWorkflowError(
          `Workflow "${snapshot.name}" is already registered.`,
          { workflowName: snapshot.name },
        );
      }
      workflows.set(snapshot.name, snapshot);
      return snapshot;
    },

    get(name: string): Workflow | undefined {
      return workflows.get(name);
    },

    list(): readonly Workflow[] {
      return assertImmutable(Array.from(workflows.values()));
    },
  };

  for (const workflow of initialWorkflows) {
    registry.register(workflow);
  }

  return registry;
}

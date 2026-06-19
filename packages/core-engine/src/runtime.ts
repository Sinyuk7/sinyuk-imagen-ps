/**
 * Runtime 组装入口 —— 把 store、events、registry、dispatch、runner 组装为统一执行面。
 */

import type { Job, JobInput, JobStore, JobStoreController } from './types/job.js';
import type { Workflow, WorkflowRegistry } from './types/workflow.js';
import type { ProviderDispatchAdapter, ProviderDispatcher } from './types/provider.js';
import type { JobEventBus, JobEvent } from './types/events.js';
import { createJobStore } from './store.js';
import { createJobEventBus } from './events.js';
import { createWorkflowRegistry } from './registry.js';
import { createProviderDispatcher } from './dispatch.js';
import { executeWorkflow } from './runner.js';
import type { Logger } from '@imagen-ps/foundation';
import { createNullLogger } from '@imagen-ps/foundation';

/** Runtime 对外暴露的统一接口。 */
export interface Runtime {
  /**
   * 提交并执行一个 workflow。
   *
   * 执行流程：submitJob → emit created → executeWorkflow → emit completed/failed。
   * 可选 `options.logger` 覆盖默认 runtime logger，用于 per-command trace 传播。
   */
  runWorkflow(workflowName: string, input: JobInput, options?: RunWorkflowOptions): Promise<Job>;

  /** Job store（读取与创建）。 */
  store: JobStore;

  /** Job lifecycle event bus（订阅）。 */
  events: JobEventBus;

  /** Workflow registry（注册与查找）。 */
  registry: WorkflowRegistry;

  /** Provider dispatcher（调用抽象）。 */
  dispatcher: ProviderDispatcher;
}

/** `createRuntime` 的可选配置。 */
export interface RuntimeOptions {
  /** 初始内置 workflows。 */
  initialWorkflows?: readonly Workflow[];

  /** 初始 provider adapters。 */
  adapters?: readonly ProviderDispatchAdapter[];

  /** 可选 Logger；未提供时使用 null logger。 */
  logger?: Logger;
}

/** 使用已有依赖执行一次 workflow 的额外选项。 */
export interface RunWorkflowOptions {
  /** 可选 Logger；未提供时使用 null logger。 */
  logger?: Logger;
}

/** 从 event bus 实例中提取内部 `emit` 方法。 */
function getEmit(events: JobEventBus): (event: JobEvent) => void {
  return (events as JobEventBus & { emit(event: JobEvent): void }).emit;
}

/**
 * 使用已有依赖执行一次 workflow。
 *
 * 本函数为底层装配接口；大多数场景应使用 `createRuntime()` 返回的 `runtime.runWorkflow()`。
 *
 * @param workflowName - 要执行的 workflow 名称
 * @param input - job 输入数据
 * @param deps - 已装配好的 engine 组件
 * @returns 执行完成后的 job snapshot
 */
export async function runWorkflow(
  workflowName: string,
  input: JobInput,
  deps: {
    store: JobStore;
    controller: JobStoreController;
    registry: WorkflowRegistry;
    dispatcher: ProviderDispatcher;
    events: JobEventBus;
  },
  options?: RunWorkflowOptions,
): Promise<Job> {
  const logger = options?.logger ?? createNullLogger();
  const job = deps.store.submitJob(input);
  const emit = getEmit(deps.events);
  emit({ type: 'created', job });

  const jobLogger = logger.child({
    package: 'core-engine',
    component: 'runtime',
    job_id: job.id,
    workflow: workflowName,
  });
  const span = jobLogger.startSpan('runtime.job');

  const result = await executeWorkflow(job, workflowName, {
    registry: deps.registry,
    controller: deps.controller,
    dispatcher: deps.dispatcher,
    logger: jobLogger,
  });

  if (result.status === 'completed') {
    span.finish();
  } else {
    span.fail(result.error ?? { message: 'workflow failed' });
  }

  emit({
    type: result.status === 'completed' ? 'completed' : 'failed',
    job: result,
  });
  return result;
}

/**
 * 创建最小可执行 runtime。
 *
 * 自动创建默认的 store、event bus、registry 与 dispatcher；
 * 可通过 `initialWorkflows` 与 `adapters` 预填充 registry 和 dispatcher。
 */
export function createRuntime(options?: RuntimeOptions): Runtime {
  const { store, controller } = createJobStore();
  const events = createJobEventBus();
  const registry = createWorkflowRegistry(options?.initialWorkflows);
  const dispatcher = createProviderDispatcher(options?.adapters, options?.logger);

  const runtimeLogger = options?.logger ?? createNullLogger();

  const runtime: Runtime = {
    async runWorkflow(workflowName: string, input: JobInput, options?: RunWorkflowOptions): Promise<Job> {
      return runWorkflow(workflowName, input, { store, controller, registry, dispatcher, events }, { logger: options?.logger ?? runtimeLogger });
    },
    store,
    events,
    registry,
    dispatcher,
  };

  return runtime;
}

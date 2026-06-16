import { describe, expect, it } from 'vitest';

import { executeWorkflow } from './runner.js';
import { createJobStore } from './store.js';
import { createWorkflowRegistry } from './registry.js';
import { createProviderDispatcher } from './dispatch.js';
import type { Workflow } from './types/workflow.js';

describe('executeWorkflow', () => {
  function makeEchoAdapter() {
    return {
      provider: 'echo',
      async dispatch(params: Record<string, unknown>) {
        return { result: params };
      },
    };
  }

  function makeFailingAdapter() {
    return {
      provider: 'fail',
      async dispatch() {
        throw new Error('provider failure');
      },
    };
  }

  it('executes provider steps sequentially', async () => {
    const { store, controller } = createJobStore();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher([makeEchoAdapter()]);

    const workflow: Workflow = {
      name: 'sequential',
      steps: [
        { name: 'first', kind: 'provider', input: { provider: 'echo', message: 'hello' } },
        { name: 'second', kind: 'provider', input: { provider: 'echo', message: 'world' } },
      ],
    };
    registry.register(workflow);

    const job = store.submitJob({});
    const result = await executeWorkflow(job, 'sequential', {
      registry,
      controller,
      dispatcher,
    });

    expect(result.status).toBe('completed');
    expect(result.output).toBeDefined();
    expect(result.output!.first).toEqual({ result: { provider: 'echo', message: 'hello' } });
    expect(result.output!.second).toEqual({ result: { provider: 'echo', message: 'world' } });
  });

  it('resolves input bindings from prior step outputs', async () => {
    const { store, controller } = createJobStore();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher([makeEchoAdapter()]);

    const workflow: Workflow = {
      name: 'binding',
      steps: [
        {
          name: 'first',
          kind: 'provider',
          input: { provider: 'echo', msg: 'hello' },
          outputKey: 'greeting',
        },
        {
          name: 'second',
          kind: 'provider',
          input: { provider: 'echo', message: '${greeting}' },
        },
      ],
    };
    registry.register(workflow);

    const job = store.submitJob({});
    const result = await executeWorkflow(job, 'binding', {
      registry,
      controller,
      dispatcher,
    });

    expect(result.status).toBe('completed');
    // ${greeting} 被替换为 step1 的输出对象
    expect(result.output!.second).toEqual({
      result: { message: { result: { provider: 'echo', msg: 'hello' } }, provider: 'echo' },
    });
  });

  it('passes unbound keys through unchanged', async () => {
    const { store, controller } = createJobStore();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher([makeEchoAdapter()]);

    const workflow: Workflow = {
      name: 'unbound',
      steps: [
        {
          name: 'echo',
          kind: 'provider',
          input: { provider: 'echo', message: '${missingKey}' },
        },
      ],
    };
    registry.register(workflow);

    const job = store.submitJob({});
    const result = await executeWorkflow(job, 'unbound', {
      registry,
      controller,
      dispatcher,
    });

    expect(result.status).toBe('completed');
    // missingKey 不在上下文中，占位符保留原样
    expect(result.output!.echo).toEqual({
      result: { message: '${missingKey}', provider: 'echo' },
    });
  });

  it('publishes output under outputKey when provided', async () => {
    const { store, controller } = createJobStore();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher([makeEchoAdapter()]);

    const workflow: Workflow = {
      name: 'output-key',
      steps: [
        {
          name: 'echo',
          kind: 'provider',
          input: { provider: 'echo', msg: 'hi' },
          outputKey: 'customKey',
        },
      ],
    };
    registry.register(workflow);

    const job = store.submitJob({});
    const result = await executeWorkflow(job, 'output-key', {
      registry,
      controller,
      dispatcher,
    });

    expect(result.status).toBe('completed');
    expect(result.output!.customKey).toBeDefined();
    expect(result.output!.echo).toBeUndefined();
  });

  it('fails for unsupported step kind', async () => {
    const { store, controller } = createJobStore();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher();

    const workflow: Workflow = {
      name: 'bad-kind',
      steps: [
        { name: 'transform', kind: 'transform' as 'provider', input: {} },
      ],
    };
    registry.register(workflow);

    const job = store.submitJob({});
    const result = await executeWorkflow(job, 'bad-kind', {
      registry,
      controller,
      dispatcher,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.error!.category).toBe('workflow');
  });

  it('fails when workflow is not found', async () => {
    const { store, controller } = createJobStore();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher();

    const job = store.submitJob({});
    const result = await executeWorkflow(job, 'missing', {
      registry,
      controller,
      dispatcher,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.error!.category).toBe('workflow');
  });

  it('fails when provider dispatch fails', async () => {
    const { store, controller } = createJobStore();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher([makeFailingAdapter()]);

    const workflow: Workflow = {
      name: 'fail-test',
      steps: [
        { name: 'fail', kind: 'provider', input: { provider: 'fail' } },
      ],
    };
    registry.register(workflow);

    const job = store.submitJob({});
    const result = await executeWorkflow(job, 'fail-test', {
      registry,
      controller,
      dispatcher,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.error!.category).toBe('provider');
  });

  it('produces immutable outputs', async () => {
    const { store, controller } = createJobStore();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher([makeEchoAdapter()]);

    const workflow: Workflow = {
      name: 'immutable',
      steps: [
        { name: 'echo', kind: 'provider', input: { provider: 'echo', value: 42 } },
      ],
    };
    registry.register(workflow);

    const job = store.submitJob({});
    const result = await executeWorkflow(job, 'immutable', {
      registry,
      controller,
      dispatcher,
    });

    expect(result.status).toBe('completed');
    expect(Object.isFrozen(result.output)).toBe(true);
  });
});

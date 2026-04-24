import { describe, expect, it } from 'vitest';

import { createRuntime, runWorkflow } from './runtime.js';
import { createJobStore } from './store.js';
import { createJobEventBus } from './events.js';
import { createWorkflowRegistry } from './registry.js';
import { createProviderDispatcher } from './dispatch.js';
import type { Workflow } from './types/workflow.js';

describe('createRuntime', () => {
  it('assembles all components', () => {
    const runtime = createRuntime();

    expect(runtime.store).toBeDefined();
    expect(runtime.events).toBeDefined();
    expect(runtime.registry).toBeDefined();
    expect(runtime.dispatcher).toBeDefined();
    expect(typeof runtime.runWorkflow).toBe('function');
  });

  it('initializes with workflows and adapters', () => {
    const workflow: Workflow = {
      name: 'test',
      steps: [{ name: 'echo', kind: 'provider', input: { msg: 'hi' } }],
    };

    const runtime = createRuntime({
      initialWorkflows: [workflow],
      adapters: [
        {
          provider: 'echo',
          async dispatch(params) {
            return params;
          },
        },
      ],
    });

    expect(runtime.registry.get('test')).toBeDefined();
  });

  it('runWorkflow executes successfully', async () => {
    const workflow: Workflow = {
      name: 'test',
      steps: [{ name: 'echo', kind: 'provider', input: { provider: 'echo', msg: 'hello' } }],
    };

    const runtime = createRuntime({
      initialWorkflows: [workflow],
      adapters: [
        {
          provider: 'echo',
          async dispatch(params) {
            return { data: params };
          },
        },
      ],
    });

    const job = await runtime.runWorkflow('test', {});
    expect(job.status).toBe('completed');
    expect(job.output).toBeDefined();
    expect(job.output!.echo).toEqual({ data: { provider: 'echo', msg: 'hello' } });
  });

  it('runWorkflow fails for unregistered workflow', async () => {
    const runtime = createRuntime();
    const job = await runtime.runWorkflow('missing', {});

    expect(job.status).toBe('failed');
    expect(job.error!.category).toBe('workflow');
  });

  it('emits lifecycle events during runWorkflow', async () => {
    const workflow: Workflow = {
      name: 'test',
      steps: [{ name: 'echo', kind: 'provider', input: { provider: 'echo', msg: 'hi' } }],
    };

    const runtime = createRuntime({
      initialWorkflows: [workflow],
      adapters: [
        {
          provider: 'echo',
          async dispatch(params) {
            return params;
          },
        },
      ],
    });

    const events: string[] = [];
    runtime.events.onAny((event) => {
      events.push(event.type);
    });

    await runtime.runWorkflow('test', {});

    expect(events).toContain('created');
    expect(events).toContain('completed');
  });

  it('emits failed event on step failure', async () => {
    const workflow: Workflow = {
      name: 'test',
      steps: [{ name: 'fail', kind: 'provider', input: { provider: 'fail' } }],
    };

    const runtime = createRuntime({
      initialWorkflows: [workflow],
      adapters: [
        {
          provider: 'fail',
          async dispatch() {
            throw new Error('boom');
          },
        },
      ],
    });

    const events: string[] = [];
    runtime.events.onAny((event) => {
      events.push(event.type);
    });

    const job = await runtime.runWorkflow('test', {});

    expect(job.status).toBe('failed');
    expect(events).toContain('created');
    expect(events).toContain('failed');
  });
});

describe('runWorkflow (standalone)', () => {
  it('works with manually assembled dependencies', async () => {
    const { store, controller } = createJobStore();
    const events = createJobEventBus();
    const registry = createWorkflowRegistry();
    const dispatcher = createProviderDispatcher([
      {
        provider: 'echo',
        async dispatch(params) {
          return params;
        },
      },
    ]);

    const workflow: Workflow = {
      name: 'standalone',
      steps: [{ name: 'echo', kind: 'provider', input: { provider: 'echo', value: 1 } }],
    };
    registry.register(workflow);

    const job = await runWorkflow('standalone', {}, {
      store,
      controller,
      registry,
      dispatcher,
      events,
    });

    expect(job.status).toBe('completed');
    expect(job.output!.echo).toEqual({ provider: 'echo', value: 1 });
  });
});

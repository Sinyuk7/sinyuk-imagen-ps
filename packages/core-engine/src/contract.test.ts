import { describe, expect, it } from 'vitest';
import { createNullLogger } from '@imagen-ps/foundation';
import { createExecutionDispatcher } from './dispatch.js';
import { createExecutionError, createProviderError, type JobError } from './errors.js';
import { createWorkflowRegistry } from './registry.js';
import { createJobStore } from './store.js';
import type { ExecutionAdapter, ExecutionContext } from './types/execution.js';
import type { Workflow } from './types/workflow.js';

function captureJobError(action: () => unknown): JobError {
  try {
    action();
  } catch (error) {
    return error as JobError;
  }
  throw new Error('Expected action to throw a JobError.');
}

describe('execution dispatch contract', () => {
  it('routes once with isolated immutable params and the same context', async () => {
    const signal = new AbortController().signal;
    const logger = createNullLogger();
    const context: ExecutionContext = { signal, logger };
    const callerParams = {
      nested: { value: 1 },
      provider: 'misleading-provider',
      backend: 'misleading-backend',
    };
    let calls = 0;
    let receivedContext: ExecutionContext | undefined;

    const adapter: ExecutionAdapter = {
      adapter: 'selected-adapter',
      async dispatch(params, received) {
        calls += 1;
        receivedContext = received;
        expect(params).not.toBe(callerParams);
        expect(params.nested).not.toBe(callerParams.nested);
        expect(Object.isFrozen(params)).toBe(true);
        expect(Object.isFrozen(params.nested)).toBe(true);
        return { nested: { ok: true } };
      },
    };

    const dispatcher = createExecutionDispatcher([adapter]);
    const result = await dispatcher.dispatch({ adapter: 'selected-adapter', params: callerParams }, context);

    expect(calls).toBe(1);
    expect(receivedContext).toBe(context);
    expect(result).toEqual({ nested: { ok: true } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen((result as { nested: object }).nested)).toBe(true);
    expect(Object.isFrozen(callerParams)).toBe(false);
    expect(Object.isFrozen(callerParams.nested)).toBe(false);
  });

  it('rejects unknown adapter and invalid caller params as validation before side effects', async () => {
    let calls = 0;
    const dispatcher = createExecutionDispatcher([{
      adapter: 'known',
      async dispatch() {
        calls += 1;
        return { ok: true };
      },
    }]);

    await expect(dispatcher.dispatch({ adapter: 'missing', params: {} })).rejects.toMatchObject({
      category: 'validation',
    });
    await expect(dispatcher.dispatch({
      adapter: 'known',
      params: { invalid: () => undefined },
    })).rejects.toMatchObject({ category: 'validation' });
    await expect(dispatcher.dispatch({
      adapter: 'known',
      params: { apiKey: 'resolved-value' },
    })).rejects.toMatchObject({ category: 'validation' });
    expect(calls).toBe(0);
  });

  it('maps unstructured failures and invalid outputs to execution without replay', async () => {
    let failureCalls = 0;
    const failing = createExecutionDispatcher([{
      adapter: 'failing',
      async dispatch() {
        failureCalls += 1;
        throw new Error('adapter exploded');
      },
    }]);

    await expect(failing.dispatch({ adapter: 'failing', params: {} })).rejects.toMatchObject({
      category: 'execution',
      message: 'Execution adapter failed.',
    });
    expect(failureCalls).toBe(1);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const output of [
      { invalid: () => undefined },
      { authorization: 'Bearer resolved-secret' },
      circular,
    ]) {
      let calls = 0;
      const dispatcher = createExecutionDispatcher([{
        adapter: 'invalid-output',
        async dispatch() {
          calls += 1;
          return output;
        },
      }]);

      await expect(dispatcher.dispatch({ adapter: 'invalid-output', params: {} })).rejects.toMatchObject({
        category: 'execution',
      });
      expect(calls).toBe(1);
    }
  });

  it('preserves a valid structured JobError category', async () => {
    const dispatcher = createExecutionDispatcher([{
      adapter: 'structured',
      async dispatch() {
        throw createProviderError('Bridge invoke failed.', { statusCode: 503 });
      },
    }]);

    await expect(dispatcher.dispatch({ adapter: 'structured', params: {} })).rejects.toEqual(
      createProviderError('Bridge invoke failed.', { statusCode: 503 }),
    );
  });

  it('rejects duplicate or empty adapter identities', () => {
    const createAdapter = (adapter: string): ExecutionAdapter => ({
      adapter,
      async dispatch() {
        return {};
      },
    });

    expect(captureJobError(() => createExecutionDispatcher([createAdapter('')]))).toMatchObject({
      category: 'validation',
    });
    expect(captureJobError(() => createExecutionDispatcher([
      { adapter: 'missing-dispatch' } as ExecutionAdapter,
    ]))).toMatchObject({ category: 'validation' });
    expect(captureJobError(() => createExecutionDispatcher([
      createAdapter('same'),
      createAdapter('same'),
    ]))).toMatchObject({ category: 'validation' });
  });
});

describe('workflow registry contract', () => {
  it('accepts only static execution steps and isolates nested workflow input', () => {
    const nested = { value: 1 };
    const workflow: Workflow = {
      name: 'static-execution',
      steps: [{
        name: 'invoke',
        kind: 'execution',
        adapter: 'echo',
        input: { nested },
      }],
    };
    const registry = createWorkflowRegistry([workflow]);
    nested.value = 2;

    const stored = registry.get('static-execution');
    expect(stored?.steps[0]?.adapter).toBe('echo');
    expect(stored?.steps[0]?.input).toEqual({ nested: { value: 1 } });
    expect(Object.isFrozen(stored?.steps[0]?.input)).toBe(true);
    expect(Object.isFrozen((stored?.steps[0]?.input?.nested as object))).toBe(true);
  });

  it('maps reserved kinds, missing adapter, and invalid step input to workflow', () => {
    const invalidWorkflows = [
      {
        name: 'provider-kind',
        steps: [{ name: 'invoke', kind: 'provider', adapter: 'echo' }],
      },
      {
        name: 'missing-adapter',
        steps: [{ name: 'invoke', kind: 'execution' }],
      },
      {
        name: 'invalid-input',
        steps: [{ name: 'invoke', kind: 'execution', adapter: 'echo', input: { value: () => undefined } }],
      },
    ] as unknown as readonly Workflow[];

    for (const workflow of invalidWorkflows) {
      expect(captureJobError(() => createWorkflowRegistry([workflow]))).toMatchObject({ category: 'workflow' });
    }
  });
});

describe('job store contract', () => {
  it('validates and isolates submitted input', () => {
    const { store } = createJobStore();
    const input = { nested: { value: 1 }, secretRefs: { apiKey: 'secret:profile:one' } };
    const job = store.submitJob(input);
    input.nested.value = 2;

    expect(job.status).toBe('created');
    expect(store.getJob(job.id)?.input).toEqual({
      nested: { value: 1 },
      secretRefs: { apiKey: 'secret:profile:one' },
    });
    expect(Object.isFrozen(job.input)).toBe(true);
    expect(Object.isFrozen(job.input.nested)).toBe(true);
    expect(captureJobError(() => store.submitJob({ apiKey: 'resolved' }))).toMatchObject({
      category: 'validation',
    });
    expect(captureJobError(() => store.submitJob({ invalid: Symbol('value') }))).toMatchObject({
      category: 'validation',
    });
    expect(captureJobError(() => store.submitJob({
      secretRefs: { apiKey: 'sk-resolved-value' },
    }))).toMatchObject({ category: 'validation' });
  });

  it('validates terminal output before transition and keeps partial output out of store', () => {
    const { store, controller } = createJobStore();
    const job = store.submitJob({ request: 'one' });
    controller.markRunning(job.id);

    const error = captureJobError(() => controller.markCompleted(job.id, {
      partial: { ok: true },
      password: 'resolved',
    }));
    expect(error).toMatchObject({ category: 'execution' });
    expect(store.getJob(job.id)).toMatchObject({ status: 'running', output: undefined });

    controller.markFailed(job.id, createExecutionError('Terminal output rejected.'));
    expect(store.getJob(job.id)).toMatchObject({
      status: 'failed',
      output: undefined,
      error: { category: 'execution' },
    });
  });

  it('preserves validated generic Retry attempt metadata', () => {
    const { store } = createJobStore();
    const retry = store.submitJob(
      { request: 'retry' },
      { originJobId: 'job-origin', retryAttempt: 2 },
    );

    expect(retry).toMatchObject({ originJobId: 'job-origin', retryAttempt: 2 });
    expect(captureJobError(() => store.submitJob(
      { request: 'invalid-retry' },
      { originJobId: '', retryAttempt: 0 },
    ))).toMatchObject({ category: 'validation' });
  });
});

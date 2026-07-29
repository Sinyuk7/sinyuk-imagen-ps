import { describe, expect, it } from 'vitest';
import { createRuntime } from './runtime.js';
import type { Workflow } from './types/workflow.js';

describe('runtime execution scenarios', () => {
  it('awaits job-created handoff before execution', async () => {
    const order: string[] = [];
    const workflow: Workflow = {
      name: 'handoff',
      steps: [{ name: 'invoke', kind: 'execution', adapter: 'echo' }],
    };
    const runtime = createRuntime({
      initialWorkflows: [workflow],
      adapters: [{
        adapter: 'echo',
        async dispatch() {
          order.push('dispatch');
          return { ok: true };
        },
      }],
    });
    runtime.events.onAny((event) => {
      if (event.type === 'created') order.push('created');
    });

    const result = await runtime.runWorkflow('handoff', {}, {
      async onJobCreated(job) {
        expect(job.status).toBe('created');
        await Promise.resolve();
        order.push('handoff');
      },
    });

    expect(order).toEqual(['created', 'handoff', 'dispatch']);
    expect(result.status).toBe('completed');
  });

  it('uses static adapter routing and ordered immutable multi-step handoff', async () => {
    const order: string[] = [];
    const adapterOwnedResult = { nested: { value: 'first' } };
    const workflow: Workflow = {
      name: 'multi-step',
      steps: [
        {
          name: 'first',
          kind: 'execution',
          adapter: 'first-adapter',
          input: {
            seed: '${seed}',
            provider: 'misleading-provider',
            backend: 'misleading-backend',
          },
          outputKey: 'firstResult',
        },
        {
          name: 'second',
          kind: 'execution',
          adapter: 'second-adapter',
          input: { previous: '${firstResult}', original: '${seed}' },
          outputKey: 'finalResult',
        },
      ],
    };
    const runtime = createRuntime({
      initialWorkflows: [workflow],
      adapters: [
        {
          adapter: 'first-adapter',
          async dispatch(params) {
            order.push('first');
            expect(params).toMatchObject({
              seed: 'start',
              provider: 'misleading-provider',
              backend: 'misleading-backend',
            });
            return adapterOwnedResult;
          },
        },
        {
          adapter: 'second-adapter',
          async dispatch(params) {
            order.push('second');
            expect(Object.isFrozen(params)).toBe(true);
            expect(Object.isFrozen(params.previous)).toBe(true);
            expect(params).toEqual({
              previous: { nested: { value: 'first' }, processed: true },
              original: 'start',
            });
            return { ok: true };
          },
        },
      ],
      afterStepResult({ stepName, result }) {
        expect(Object.isFrozen(result)).toBe(true);
        if (stepName === 'first') {
          return { ...(result as Record<string, unknown>), processed: true };
        }
        return result;
      },
    });

    const result = await runtime.runWorkflow('multi-step', { seed: 'start' });
    adapterOwnedResult.nested.value = 'mutated-after-dispatch';

    expect(order).toEqual(['first', 'second']);
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({
      seed: 'start',
      firstResult: { nested: { value: 'first' }, processed: true },
      finalResult: { ok: true },
    });
    expect(Object.isFrozen(result.output)).toBe(true);
    expect(Object.isFrozen(result.output?.firstResult)).toBe(true);
  });

  it('fails invalid afterStepResult before terminal store write', async () => {
    const runtime = createRuntime({
      initialWorkflows: [{
        name: 'invalid-hook-output',
        steps: [{ name: 'invoke', kind: 'execution', adapter: 'echo' }],
      }],
      adapters: [{
        adapter: 'echo',
        async dispatch() {
          return { partial: true };
        },
      }],
      afterStepResult() {
        return { authorization: 'Bearer resolved-secret' };
      },
    });

    const result = await runtime.runWorkflow('invalid-hook-output', {});
    expect(result).toMatchObject({
      status: 'failed',
      output: undefined,
      error: { category: 'execution' },
    });
  });

  it('preserves structured afterStepResult failures for host diagnostics', async () => {
    const runtime = createRuntime({
      initialWorkflows: [{
        name: 'structured-hook-failure',
        steps: [{ name: 'invoke', kind: 'execution', adapter: 'echo' }],
      }],
      adapters: [{
        adapter: 'echo',
        async dispatch() {
          return { partial: true };
        },
      }],
      afterStepResult() {
        throw {
          category: 'execution',
          message: 'Generated image persistence failed.',
          details: {
            operation: 'asset-store.put',
            stage: 'write-file',
            byteLength: 42,
            errorName: 'Error',
          },
        };
      },
    });

    await expect(runtime.runWorkflow('structured-hook-failure', {})).resolves.toMatchObject({
      status: 'failed',
      output: undefined,
      error: {
        category: 'execution',
        message: 'Generated image persistence failed.',
        details: { operation: 'asset-store.put', stage: 'write-file', byteLength: 42, errorName: 'Error' },
      },
    });
  });

  it('does not dispatch when already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();
    let calls = 0;
    const runtime = createRuntime({
      initialWorkflows: [{
        name: 'pre-abort',
        steps: [{ name: 'invoke', kind: 'execution', adapter: 'echo' }],
      }],
      adapters: [{
        adapter: 'echo',
        async dispatch() {
          calls += 1;
          return { partial: true };
        },
      }],
    });

    const result = await runtime.runWorkflow('pre-abort', {}, { signal: abortController.signal });
    expect(calls).toBe(0);
    expect(result).toMatchObject({ status: 'failed', output: undefined, error: { category: 'execution' } });
  });

  it('does not replay or persist partial output when aborted during dispatch', async () => {
    const abortController = new AbortController();
    let calls = 0;
    const runtime = createRuntime({
      initialWorkflows: [{
        name: 'dispatch-abort',
        steps: [{ name: 'invoke', kind: 'execution', adapter: 'echo' }],
      }],
      adapters: [{
        adapter: 'echo',
        async dispatch(_params, context) {
          calls += 1;
          expect(context?.signal).toBe(abortController.signal);
          abortController.abort();
          return { partial: true };
        },
      }],
    });

    const result = await runtime.runWorkflow('dispatch-abort', {}, { signal: abortController.signal });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ status: 'failed', output: undefined, error: { category: 'execution' } });
  });

  it('does not persist output when aborted after result processing', async () => {
    const abortController = new AbortController();
    let calls = 0;
    const runtime = createRuntime({
      initialWorkflows: [{
        name: 'handoff-abort',
        steps: [{ name: 'invoke', kind: 'execution', adapter: 'echo' }],
      }],
      adapters: [{
        adapter: 'echo',
        async dispatch() {
          calls += 1;
          return { partial: true };
        },
      }],
      afterStepResult({ result }) {
        abortController.abort();
        return result;
      },
    });

    const result = await runtime.runWorkflow('handoff-abort', {}, { signal: abortController.signal });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ status: 'failed', output: undefined, error: { category: 'execution' } });
  });
});

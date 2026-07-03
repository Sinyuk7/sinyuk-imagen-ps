import { describe, expect, it } from 'vitest';
import { createLogger, createMemorySink, generateTraceId } from '@imagen-ps/foundation';
import { createRuntime } from './runtime.js';
import type { Workflow } from './types/workflow.js';

describe('createRuntime with logger', () => {
  it('emits runtime.job and runner.step events for a successful workflow', async () => {
    const sink = createMemorySink();
    const traceId = generateTraceId();
    const logger = createLogger({ sink, traceId });

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
      logger,
    });

    await runtime.runWorkflow('test', {});

    const events = sink.records.map((r) => r.event);
    expect(events).toContain('runtime.job.start');
    expect(events).toContain('runtime.job.ok');
    expect(events).toContain('runner.step.start');
    expect(events).toContain('runner.step.ok');
    expect(events).toContain('dispatch.provider.start');

    const runtimeStart = sink.records.find((r) => r.event === 'runtime.job.start');
    const stepStart = sink.records.find((r) => r.event === 'runner.step.start');
    const dispatchStart = sink.records.find((r) => r.event === 'dispatch.provider.start');
    const jobOk = sink.records.find((r) => r.event === 'runtime.job.ok');
    expect(jobOk?.trace_id).toBe(traceId);
    expect(jobOk?.duration_ms).toBeGreaterThanOrEqual(0);
    expect(stepStart?.parent_span_id).toBe(runtimeStart?.span_id);
    expect(dispatchStart?.parent_span_id).toBe(stepStart?.span_id);
  });

  it('emits runner.step.fail and runtime.job.fail on step error', async () => {
    const sink = createMemorySink();

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
      logger: createLogger({ sink }),
    });

    const job = await runtime.runWorkflow('test', {});
    expect(job.status).toBe('failed');

    const events = sink.records.map((r) => r.event);
    expect(events).toContain('runtime.job.fail');
    expect(events).toContain('runner.step.fail');
  });
});

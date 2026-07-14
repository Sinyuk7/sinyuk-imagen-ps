import { describe, expect, it } from 'vitest';
import { createRuntime } from './runtime.js';
import type { Workflow } from './types/workflow.js';

describe('runtime job-created handoff', () => {
  it('awaits the handoff before provider execution', async () => {
    const order: string[] = [];
    const workflow: Workflow = {
      name: 'handoff',
      steps: [{ name: 'invoke', kind: 'provider', input: { provider: 'echo' } }],
    };
    const runtime = createRuntime({
      initialWorkflows: [workflow],
      adapters: [{
        provider: 'echo',
        async dispatch() {
          order.push('dispatch');
          return { ok: true };
        },
      }],
    });
    runtime.events.onAny((event) => {
      if (event.type === 'created') order.push('created');
    });

    await runtime.runWorkflow('handoff', {}, {
      async onJobCreated(job) {
        expect(job.status).toBe('created');
        await Promise.resolve();
        order.push('handoff');
      },
    });

    expect(order).toEqual(['created', 'handoff', 'dispatch']);
  });
});

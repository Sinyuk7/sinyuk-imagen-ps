import { describe, expect, it } from 'vitest';
import {
  createRuntime,
  createWorkflowRegistry,
  type ProviderDispatchAdapter,
} from '@imagen-ps/core-engine';

import {
  builtinWorkflows,
  providerEditWorkflow,
  providerGenerateWorkflow,
} from '../src/index.js';

describe('@imagen-ps/workflows builtins', () => {
  it('exports the minimal builtin workflow set', () => {
    expect(builtinWorkflows).toEqual([
      providerGenerateWorkflow,
      providerEditWorkflow,
    ]);
  });

  it('keeps exported builtin specs immutable', () => {
    expect(Object.isFrozen(providerGenerateWorkflow)).toBe(true);
    expect(Object.isFrozen(providerGenerateWorkflow.steps)).toBe(true);
    expect(Object.isFrozen(providerGenerateWorkflow.steps[0])).toBe(true);
    expect(Object.isFrozen(providerGenerateWorkflow.steps[0].input)).toBe(true);
    expect(Object.isFrozen(providerEditWorkflow)).toBe(true);
  });

  it('registers builtin workflows without shape errors', () => {
    const registry = createWorkflowRegistry(builtinWorkflows);

    expect(registry.get('provider-generate')).toEqual(providerGenerateWorkflow);
    expect(registry.get('provider-edit')).toEqual(providerEditWorkflow);
    expect(registry.list()).toHaveLength(2);
  });

  it('is compatible with runtime for provider-generate happy path', async () => {
    const adapter: ProviderDispatchAdapter = {
      provider: 'mock',
      async dispatch(params) {
        return Object.freeze({ echoed: params });
      },
    };

    const runtime = createRuntime({
      initialWorkflows: builtinWorkflows,
      adapters: [adapter],
    });

    const job = await runtime.runWorkflow('provider-generate', {
      provider: 'mock',
      prompt: 'hello workflow',
    });

    expect(job.status).toBe('completed');
    expect(job.output?.image).toEqual({
      echoed: {
        provider: 'mock',
        request: {
          operation: 'generate',
          prompt: 'hello workflow',
        },
      },
    });
  });

  it('is compatible with runtime for provider-edit happy path', async () => {
    const adapter: ProviderDispatchAdapter = {
      provider: 'mock',
      async dispatch(params) {
        return Object.freeze({ echoed: params });
      },
    };

    const runtime = createRuntime({
      initialWorkflows: builtinWorkflows,
      adapters: [adapter],
    });

    const job = await runtime.runWorkflow('provider-edit', {
      provider: 'mock',
      prompt: 'edit workflow',
      inputAssets: [
        {
          type: 'image',
          name: 'input.png',
          url: 'https://example.com/input.png',
          mimeType: 'image/png',
        },
      ],
    });

    expect(job.status).toBe('completed');
    expect(job.output?.image).toEqual({
      echoed: {
        provider: 'mock',
        request: {
          operation: 'edit',
          prompt: 'edit workflow',
          inputAssets: [
            {
              type: 'image',
              name: 'input.png',
              url: 'https://example.com/input.png',
              mimeType: 'image/png',
            },
          ],
        },
      },
    });
  });
});

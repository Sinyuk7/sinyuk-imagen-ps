import { describe, expect, it } from 'vitest';
import { createRuntime, createWorkflowRegistry, type ProviderDispatchAdapter } from '@imagen-ps/core-engine';
import { builtinWorkflows, providerEditWorkflow, providerGenerateWorkflow } from './index.js';

function createEchoAdapter(): ProviderDispatchAdapter {
  return {
    provider: 'mock',
    async dispatch(params) {
      return Object.freeze({ echoed: params });
    },
  };
}

describe('application request builders', () => {
  it('exports the minimal builtin workflow set', () => {
    expect(builtinWorkflows).toEqual([providerGenerateWorkflow, providerEditWorkflow]);
  });

  it('keeps exported request specs immutable', () => {
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

  it('maps generate input to the same provider request shape', async () => {
    const runtime = createRuntime({
      initialWorkflows: builtinWorkflows,
      adapters: [createEchoAdapter()],
    });

    const job = await runtime.runWorkflow('provider-generate', {
      provider: 'mock',
      prompt: 'hello workflow',
    });

    expect(job.status).toBe('completed');
    expect(job.output?.image).toEqual({
      echoed: {
        profileId: '${profileId}',
        provider: 'mock',
        providerProfileId: '${providerProfileId}',
        request: {
          operation: 'text_to_image',
          prompt: 'hello workflow',
          output: '${output}',
          providerOptions: '${providerOptions}',
        },
      },
    });
  });

  it('maps edit input to the same provider request shape', async () => {
    const runtime = createRuntime({
      initialWorkflows: builtinWorkflows,
      adapters: [createEchoAdapter()],
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
        profileId: '${profileId}',
        provider: 'mock',
        providerProfileId: '${providerProfileId}',
        request: {
          operation: 'image_edit',
          prompt: 'edit workflow',
          images: '${images}',
          maskImage: '${maskImage}',
          output: '${output}',
          providerOptions: '${providerOptions}',
        },
      },
    });
  });
});

import { describe, expect, it } from 'vitest';
import { createRuntime, createWorkflowRegistry, type ProviderDispatchAdapter } from '@imagen-ps/core-engine';
import { createDispatchAdapter, createMockProvider } from '@imagen-ps/providers';

import { builtinWorkflows, providerEditWorkflow, providerGenerateWorkflow } from '../src/index.js';

function createEchoAdapter(): ProviderDispatchAdapter {
  return {
    provider: 'mock',
    async dispatch(params) {
      return Object.freeze({ echoed: params });
    },
  };
}

function createMockBridgeAdapter(): ProviderDispatchAdapter {
  const provider = createMockProvider();
  const config = provider.validateConfig({
    providerId: 'mock',
    displayName: 'Mock Provider',
    family: 'openai-compatible',
    baseURL: 'https://example.com',
    apiKey: 'test-key',
    delayMs: 0,
  });

  return createDispatchAdapter({
    provider,
    config,
  });
}

describe('@imagen-ps/workflows builtins', () => {
  it('exports the minimal builtin workflow set', () => {
    expect(builtinWorkflows).toEqual([providerGenerateWorkflow, providerEditWorkflow]);
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
          operation: 'generate',
          prompt: 'hello workflow',
          providerOptions: '${providerOptions}',
        },
      },
    });
  });

  it('is compatible with runtime for provider-edit happy path', async () => {
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

  it('exposes stable generate bindings including providerOptions and stable output key', () => {
    expect(providerGenerateWorkflow.steps[0]).toMatchObject({
      name: 'generate',
      kind: 'provider',
      outputKey: 'image',
      input: {
        provider: '${provider}',
        request: {
          operation: 'generate',
          prompt: '${prompt}',
          providerOptions: '${providerOptions}',
        },
      },
    });

    const request = providerGenerateWorkflow.steps[0].input?.request as Record<string, unknown>;
    expect(request).toHaveProperty('providerOptions', '${providerOptions}');
    expect(request).not.toHaveProperty('maskAsset');
    expect(request).not.toHaveProperty('output');
  });

  it('exposes only the stable edit bindings and stable output key', () => {
    expect(providerEditWorkflow.steps[0]).toMatchObject({
      name: 'edit',
      kind: 'provider',
      outputKey: 'image',
      input: {
        provider: '${provider}',
        request: {
          operation: 'edit',
          prompt: '${prompt}',
          inputAssets: '${inputAssets}',
        },
      },
    });

    const request = providerEditWorkflow.steps[0].input?.request as Record<string, unknown>;
    expect(request).not.toHaveProperty('maskAsset');
    expect(request).not.toHaveProperty('output');
    expect(request).not.toHaveProperty('providerOptions');
  });

  it('is compatible with a real mock provider bridge for generate', async () => {
    const result = await createMockBridgeAdapter().dispatch({
      provider: 'mock',
      request: {
        operation: 'generate',
        prompt: 'bridge generate',
      },
    });

    expect(result).toMatchObject({
      raw: {
        mock: true,
        operation: 'generate',
        prompt: 'bridge generate',
      },
    });
    expect(Array.isArray((result as { assets?: unknown[] }).assets)).toBe(true);
  });

  it('is compatible with a real mock provider bridge for edit', async () => {
    const inputAssets = [
      {
        type: 'image' as const,
        name: 'input.png',
        url: 'https://example.com/input.png',
        mimeType: 'image/png',
      },
    ];

    const result = await createMockBridgeAdapter().dispatch({
      provider: 'mock',
      request: {
        operation: 'edit',
        prompt: 'bridge edit',
        inputAssets,
      },
    });

    expect(result).toMatchObject({
      raw: {
        mock: true,
        operation: 'edit',
        prompt: 'bridge edit',
      },
    });
    expect(Array.isArray((result as { assets?: unknown[] }).assets)).toBe(true);
  });
});

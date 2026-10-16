import { describe, expect, it, vi } from 'vitest';
import type { Provider, ProviderDescriptor } from '../../src/contract/provider.js';
import type { ProviderRequest } from '../../src/contract/request.js';
import { createProviderExecutionAdapter } from '../../src/bridge/create-provider-execution-adapter.js';
import { createRunningHubProvider } from '../../src/providers/runninghub/index.js';

describe('provider execution bridge', () => {
  it('passes the resolver result directly as provider config', async () => {
    const config = {
      providerId: 'runninghub',
      displayName: 'RunningHub',
      family: 'runninghub',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://example.test', enabled: true }],
      },
      apiKey: 'secret',
    };
    const validateConfig = vi.fn((input: unknown) => input as typeof config);
    const request: ProviderRequest = { operation: 'text_to_image', prompt: 'test' };
    const descriptor: ProviderDescriptor = {
      id: 'runninghub',
      family: 'runninghub',
      displayName: 'RunningHub',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
      defaultModelTemplates: [],
    };
    const provider = {
      id: 'runninghub',
      family: 'runninghub',
      describe: () => descriptor,
      validateConfig,
      validateRequest: (input: unknown) => input as ProviderRequest,
      invoke: vi.fn(async () => ({ assets: [] })),
    } as unknown as Provider;

    const adapter = createProviderExecutionAdapter({
      providerRegistry: { get: () => provider },
      configResolver: { resolve: async () => config },
      requestMaterializer: { materialize: async ({ request: value }) => value },
    });

    await adapter.dispatch({ implementationId: 'runninghub', providerId: 'runninghub', request });

    expect(validateConfig).toHaveBeenCalledOnce();
    expect(validateConfig).toHaveBeenCalledWith(config);
    expect(provider.invoke).toHaveBeenCalledWith(expect.objectContaining({ config }));
  });

  it('preserves RunningHub modelId through request validation', () => {
    const provider = createRunningHubProvider();
    const request = provider.validateRequest({
      operation: 'text_to_image',
      prompt: 'test',
      providerId: 'runninghub',
      modelId: 'gpt-image-2',
    });

    expect(request.modelId).toBe('gpt-image-2');
  });
});

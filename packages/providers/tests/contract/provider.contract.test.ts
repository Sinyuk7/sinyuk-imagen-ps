import { createValidationError } from '@imagen-ps/core-engine';
import { createNullLogger } from '@imagen-ps/foundation';
import { describe, expect, it, vi } from 'vitest';
import {
  createProviderExecutionAdapter,
  PROVIDER_EXECUTION_ADAPTER_ID,
  type Provider,
  type ProviderAsyncExecutionExecutor,
  type ProviderAsyncLifecycle,
  type ProviderConfig,
  type ProviderInvokeResult,
  type ProviderRequest,
} from '../../src/index.js';

const request: ProviderRequest = {
  operation: 'text_to_image',
  prompt: 'contract prompt',
};

function createProviderHarness() {
  const validateConfig = vi.fn((input: unknown) => input as ProviderConfig);
  const validateRequest = vi.fn((input: unknown) => input as ProviderRequest);
  const invoke = vi.fn(async ({ config }: { readonly config: ProviderConfig }): Promise<ProviderInvokeResult> => ({
    assets: [],
    raw: { revision: (config as unknown as { readonly revision?: number }).revision },
  }));
  const provider: Provider<ProviderConfig, ProviderRequest> = {
    id: 'image-endpoint',
    family: 'image-endpoint',
    describe: () => ({
      id: 'image-endpoint',
      family: 'image-endpoint',
      apiFormat: 'openai-images',
      displayName: 'Contract Provider',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
      defaultModelTemplates: [],
    }),
    validateConfig,
    validateRequest,
    invoke,
  };
  return { provider, validateConfig, validateRequest, invoke };
}

function identityRequestMaterializer() {
  return {
    async materialize(input: { readonly request: ProviderRequest }): Promise<ProviderRequest> {
      return input.request;
    },
  };
}

describe('Provider ExecutionAdapter contract', () => {
  it('uses stable adapter id, exact implementation lookup, and fresh config per dispatch', async () => {
    const harness = createProviderHarness();
    const registryGet = vi.fn((id: string) => id === harness.provider.id ? harness.provider : undefined);
    let revision = 0;
    const resolve = vi.fn(async () => ({ revision: ++revision }));
    const adapter = createProviderExecutionAdapter({
      providerRegistry: { get: registryGet },
      configResolver: { resolve },
      requestMaterializer: identityRequestMaterializer(),
    });
    const logger = createNullLogger();
    const controller = new AbortController();
    const params = {
      implementationId: harness.provider.id,
      profileId: 'profile-a',
      request,
    };

    expect(adapter.adapter).toBe(PROVIDER_EXECUTION_ADAPTER_ID);
    await expect(adapter.dispatch(params, { logger, signal: controller.signal })).resolves.toMatchObject({
      raw: { revision: 1 },
    });
    await expect(adapter.dispatch(params, { logger, signal: controller.signal })).resolves.toMatchObject({
      raw: { revision: 2 },
    });

    expect(registryGet).toHaveBeenNthCalledWith(1, 'image-endpoint');
    expect(resolve).toHaveBeenNthCalledWith(1, {
      implementationId: 'image-endpoint',
      profileId: 'profile-a',
    });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(harness.validateRequest).toHaveBeenCalledTimes(2);
    expect(harness.validateConfig).toHaveBeenCalledTimes(2);
    expect(harness.invoke).toHaveBeenCalledTimes(2);
    expect(harness.invoke.mock.calls[0]?.[0]).toMatchObject({
      signal: controller.signal,
      logger,
    });
  });

  it('materializes ordered StoredAssetRefs once before request validation and invoke', async () => {
    const harness = createProviderHarness();
    const order: string[] = [];
    harness.validateRequest.mockImplementationOnce((input) => {
      order.push('validate');
      return input as ProviderRequest;
    });
    harness.invoke.mockImplementationOnce(async ({ request: invokedRequest }) => {
      order.push('invoke');
      return {
        assets: [],
        raw: {
          names: invokedRequest.images?.map((image) => image.name),
          bytes: invokedRequest.images?.map((image) => image.data instanceof Uint8Array ? image.data[0] : undefined),
        },
      };
    });
    const materialize = vi.fn(async (input: { readonly request: ProviderRequest }) => {
      order.push('materialize');
      return {
        ...input.request,
        images: input.request.images?.map((image, index) => ({
          ...image,
          data: new Uint8Array([index + 1]),
        })),
      };
    });
    const resolve = vi.fn(async () => ({ revision: 1 }));
    const signal = new AbortController().signal;
    const editRequest: ProviderRequest = {
      operation: 'image_edit',
      prompt: 'ordered refs',
      images: [
        { type: 'image', name: 'first', storedRef: { kind: 'hostObject', ref: 'asset-1' } },
        { type: 'image', name: 'second', storedRef: { kind: 'hostObject', ref: 'asset-2' } },
      ],
    };
    const adapter = createProviderExecutionAdapter({
      providerRegistry: { get: () => harness.provider },
      configResolver: { resolve },
      requestMaterializer: { materialize },
    });

    await expect(adapter.dispatch({
      implementationId: harness.provider.id,
      profileId: 'profile-a',
      request: editRequest,
    }, { signal })).resolves.toMatchObject({
      raw: {
        names: ['first', 'second'],
        bytes: [1, 2],
      },
    });
    expect(order).toEqual(['materialize', 'validate', 'invoke']);
    expect(materialize).toHaveBeenCalledOnce();
    expect(materialize).toHaveBeenCalledWith({
      implementationId: harness.provider.id,
      profileId: 'profile-a',
      request: editRequest,
    }, signal);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('rejects request validation before config resolution or invoke', async () => {
    const harness = createProviderHarness();
    harness.validateRequest.mockImplementationOnce(() => {
      throw createValidationError('Prompt is invalid.', { field: 'prompt' });
    });
    const resolve = vi.fn(async () => ({ revision: 1 }));
    const adapter = createProviderExecutionAdapter({
      providerRegistry: { get: () => harness.provider },
      configResolver: { resolve },
      requestMaterializer: identityRequestMaterializer(),
    });

    await expect(adapter.dispatch({
      implementationId: harness.provider.id,
      profileId: 'profile-a',
      request,
    })).rejects.toMatchObject({
      category: 'validation',
      message: 'Prompt is invalid.',
      details: { field: 'prompt' },
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(harness.invoke).not.toHaveBeenCalled();
  });

  it('rejects unknown implementation before reading current config', async () => {
    const resolve = vi.fn(async () => ({ revision: 1 }));
    const adapter = createProviderExecutionAdapter({
      providerRegistry: { get: () => undefined },
      configResolver: { resolve },
      requestMaterializer: identityRequestMaterializer(),
    });

    await expect(adapter.dispatch({
      implementationId: 'missing',
      profileId: 'profile-a',
      request,
    })).rejects.toMatchObject({
      category: 'validation',
      details: { implementationId: 'missing', profileId: 'profile-a' },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('sanitizes resolver failures and refuses secret-bearing provider output', async () => {
    const harness = createProviderHarness();
    const resolverFailureAdapter = createProviderExecutionAdapter({
      providerRegistry: { get: () => harness.provider },
      configResolver: {
        resolve: async () => {
          throw new Error('Bearer abcdefghijk');
        },
      },
      requestMaterializer: identityRequestMaterializer(),
    });
    const params = {
      implementationId: harness.provider.id,
      profileId: 'profile-a',
      request,
    };

    await expect(resolverFailureAdapter.dispatch(params)).rejects.toMatchObject({
      category: 'validation',
      message: 'Provider validation failed.',
    });

    harness.invoke.mockResolvedValueOnce({
      assets: [],
      raw: { apiKey: 'sk_abcdefgh' },
    });
    const secretOutputAdapter = createProviderExecutionAdapter({
      providerRegistry: { get: () => harness.provider },
      configResolver: { resolve: async () => ({ revision: 1 }) },
      requestMaterializer: identityRequestMaterializer(),
    });
    await expect(secretOutputAdapter.dispatch(params)).rejects.toMatchObject({
      category: 'provider',
      message: 'Provider returned an invalid result.',
    });
  });

  it('routes an async lifecycle through the injected executor without invoking sync transport', async () => {
    const harness = createProviderHarness();
    const asyncLifecycle: ProviderAsyncLifecycle<ProviderConfig, ProviderRequest> = {
      submit: vi.fn(async () => ({ status: 'pending', remoteRef: 'opaque-ref' })),
      poll: vi.fn(async () => ({ status: 'completed', result: { assets: [] } })),
    };
    const provider: Provider<ProviderConfig, ProviderRequest> = {
      ...harness.provider,
      describe: () => ({ ...harness.provider.describe(), invokeMode: 'async' }),
      asyncLifecycle,
    };
    const execute = vi.fn(async () => ({ assets: [], raw: { async: true } }));
    const executor: ProviderAsyncExecutionExecutor = { execute };
    const adapter = createProviderExecutionAdapter({
      providerRegistry: { get: () => provider },
      configResolver: { resolve: async () => ({ revision: 1 }) },
      requestMaterializer: identityRequestMaterializer(),
      asyncExecutionExecutor: executor,
    });

    await expect(adapter.dispatch({
      implementationId: provider.id,
      profileId: 'profile-a',
      request,
    }, { jobId: 'job-async' })).resolves.toMatchObject({ raw: { async: true } });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ jobId: 'job-async', lifecycle: asyncLifecycle });
    expect(harness.invoke).not.toHaveBeenCalled();
  });
});

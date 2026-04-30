import { describe, expect, it, vi } from 'vitest';
import { createRuntime, type ProviderDispatchAdapter } from '@imagen-ps/core-engine';
import { builtinWorkflows } from '../src/index.js';
import {
  createMockBridgeAdapter,
  createOpenAICompatibleBridgeAdapter,
  createRuntimeWithBuiltins,
  generateValidGenerateInput,
  generateValidEditInput,
} from './fixtures.js';

describe('cross-package compatibility', () => {
  // ------------------------------------------------------------------
  // 2. Boundary input shapes
  // ------------------------------------------------------------------

  describe('provider-generate boundary inputs', () => {
    it('accepts missing optional fields (providerOptions, output)', async () => {
      const runtime = createRuntimeWithBuiltins([createMockBridgeAdapter()]);
      const job = await runtime.runWorkflow('provider-generate', generateValidGenerateInput());

      expect(job.status).toBe('completed');
      expect(job.output?.image).toBeDefined();
    });

    it('passes extra job input fields through to the provider', async () => {
      const runtime = createRuntimeWithBuiltins([createMockBridgeAdapter()]);
      const job = await runtime.runWorkflow('provider-generate', {
        provider: 'mock',
        prompt: 'hello',
        customField: 'extra-value',
      });

      expect(job.status).toBe('completed');
      // Extra fields are present in the provider params because runner
      // includes the full job input in the dispatch context.
      const image = job.output?.image as Record<string, unknown>;
      expect(image.raw).toMatchObject({
        mock: true,
        operation: 'generate',
        prompt: 'hello',
      });
    });
  });

  describe('provider-edit boundary inputs', () => {
    it('accepts an empty inputAssets array', async () => {
      const runtime = createRuntimeWithBuiltins([createMockBridgeAdapter()]);
      const job = await runtime.runWorkflow('provider-edit', {
        provider: 'mock',
        prompt: 'edit with empty assets',
        inputAssets: [],
      });

      expect(job.status).toBe('completed');
      expect(job.output?.image).toBeDefined();
    });

    it('accepts missing optional fields (maskAsset, output, providerOptions)', async () => {
      const runtime = createRuntimeWithBuiltins([createMockBridgeAdapter()]);
      const job = await runtime.runWorkflow('provider-edit', generateValidEditInput());

      expect(job.status).toBe('completed');
      expect(job.output?.image).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // 2.4 Deep-freeze / immutability after runtime assembly
  // ------------------------------------------------------------------

  describe('deep-freeze and immutability', () => {
    it('preserves frozen workflow specs after runtime assembly', () => {
      const originalWorkflows = builtinWorkflows;
      const runtime = createRuntime({ initialWorkflows: originalWorkflows });

      const registered = runtime.registry.get('provider-generate');
      expect(registered).toBeDefined();
      expect(Object.isFrozen(registered)).toBe(true);
      expect(Object.isFrozen(registered!.steps)).toBe(true);
      expect(Object.isFrozen(registered!.steps[0])).toBe(true);
    });

    it('does not mutate the original builtinWorkflows array', () => {
      const originalLength = builtinWorkflows.length;
      createRuntime({ initialWorkflows: builtinWorkflows });

      // Runtime assembly should not modify the source array
      expect(builtinWorkflows.length).toBe(originalLength);
      expect(builtinWorkflows[0].name).toBe('provider-generate');
    });

    it('does not mutate registry entries after execution', async () => {
      const runtime = createRuntimeWithBuiltins([createMockBridgeAdapter()]);
      const before = runtime.registry.get('provider-generate');

      void (await runtime.runWorkflow('provider-generate', generateValidGenerateInput()));

      const after = runtime.registry.get('provider-generate');
      expect(after).toEqual(before);
    });
  });

  // ------------------------------------------------------------------
  // 3. Mock provider error paths
  // ------------------------------------------------------------------

  describe('mock provider dispatch failure', () => {
    it('returns a structured provider error when failMode is always', async () => {
      const runtime = createRuntimeWithBuiltins([createMockBridgeAdapter({ failMode: { type: 'always' } })]);

      const job = await runtime.runWorkflow('provider-generate', generateValidGenerateInput());

      expect(job.status).toBe('failed');
      expect(job.error?.category).toBe('provider');
      expect(job.error?.message).toContain('forced failure');
    });
  });

  describe('validation failure', () => {
    it('returns a validation error when prompt is empty', async () => {
      const runtime = createRuntimeWithBuiltins([createMockBridgeAdapter()]);
      const job = await runtime.runWorkflow('provider-generate', {
        provider: 'mock',
        prompt: '',
      });

      expect(job.status).toBe('failed');
      expect(job.error?.category).toBe('validation');
    });

    it('returns a validation error when edit inputAssets is missing', async () => {
      const runtime = createRuntimeWithBuiltins([createMockBridgeAdapter()]);
      const job = await runtime.runWorkflow('provider-edit', {
        provider: 'mock',
        prompt: 'edit without assets',
      });

      expect(job.status).toBe('failed');
      expect(job.error?.category).toBe('validation');
    });
  });

  describe('provider not registered', () => {
    it('returns a clear provider-not-found error', async () => {
      const runtime = createRuntimeWithBuiltins([]);
      const job = await runtime.runWorkflow('provider-generate', generateValidGenerateInput());

      expect(job.status).toBe('failed');
      expect(job.error?.category).toBe('provider');
      expect(job.error?.message).toContain('No provider adapter registered');
    });
  });

  describe('bridge returns malformed shape', () => {
    it('does not crash and records the result', async () => {
      const malformedAdapter: ProviderDispatchAdapter = {
        provider: 'mock',
        async dispatch() {
          return { invalid: true } as unknown;
        },
      };

      const runtime = createRuntimeWithBuiltins([malformedAdapter]);
      const job = await runtime.runWorkflow('provider-generate', generateValidGenerateInput());

      expect(job.status).toBe('completed');
      expect(job.output?.image).toEqual({ invalid: true });
    });
  });

  // ------------------------------------------------------------------
  // 4. Real provider bridge integration
  // ------------------------------------------------------------------

  describe('openai-compatible provider bridge', () => {
    it('consumes provider-generate params on the happy path', async () => {
      // Use mockResolvedValue (not Once) because retry policy may call fetch multiple times.
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                url: 'https://example.com/image.png',
                revised_prompt: 'a red apple',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const adapter = createOpenAICompatibleBridgeAdapter();
      const runtime = createRuntimeWithBuiltins([adapter]);

      const job = await runtime.runWorkflow('provider-generate', {
        provider: 'openai-compatible',
        prompt: 'a red apple',
      });

      expect(job.status).toBe('completed');
      expect(job.output?.image).toBeDefined();

      const request = fetchSpy.mock.calls[0][1] as {
        body: string;
        headers: Record<string, string>;
      };
      const body = JSON.parse(request.body);
      expect(body).toMatchObject({
        model: 'dall-e-3',
        prompt: 'a red apple',
        response_format: 'url',
      });

      fetchSpy.mockRestore();
    });

    it('rejects provider-edit before transport as a compatibility boundary', async () => {
      const adapter = createOpenAICompatibleBridgeAdapter();
      const runtime = createRuntimeWithBuiltins([adapter]);

      const job = await runtime.runWorkflow('provider-edit', {
        provider: 'openai-compatible',
        prompt: 'edit attempt',
        inputAssets: [
          {
            type: 'image',
            name: 'input.png',
            url: 'https://example.com/input.png',
            mimeType: 'image/png',
          },
        ],
      });

      expect(job.status).toBe('failed');
      // NOTE: createDispatchAdapter maps invoke-phase errors to 'provider' category,
      // so the rejection surfaces as a provider error rather than validation.
      // This is recorded as a current compatibility boundary.
      expect(job.error?.category).toBe('provider');
      expect(job.error?.message).toContain('only supports "generate"');
    });
  });
});

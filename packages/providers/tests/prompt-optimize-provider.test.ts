import { describe, expect, it, vi } from 'vitest';
import {
  createPromptOptimizeProvider,
  promptOptimizeDescriptor,
  promptOptimizeConfigSchema,
} from '../src/providers/prompt-optimize/index.js';
import { buildPromptOptimizeRequestBody } from '../src/providers/prompt-optimize/build-request.js';
import { parsePromptOptimizeResponse } from '../src/providers/prompt-optimize/parse-response.js';
import { parsePromptOptimizeModelsResponse } from '../src/providers/prompt-optimize/models.js';

const validConfigInput = {
  providerId: 'prompt-optimize',
  displayName: 'Prompt Optimizer',
  family: 'prompt-optimize',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: 'test-key',
  instruction: 'Rewrite the prompt.',
  defaultModel: 'gpt-4o-mini',
};

describe('prompt-optimize provider', () => {
  it('exposes descriptor and validates config', () => {
    const provider = createPromptOptimizeProvider();
    const config = provider.validateConfig(validConfigInput);

    expect(provider.id).toBe('prompt-optimize');
    expect(provider.family).toBe('prompt-optimize');
    expect(provider.describe()).toEqual(promptOptimizeDescriptor);
    expect(provider.describe().operations).toEqual(['text_to_image']);
    expect(config.instruction).toBe('Rewrite the prompt.');
  });

  it('rejects config with empty instruction', () => {
    expect(() =>
      promptOptimizeConfigSchema.parse({ ...validConfigInput, instruction: '' }),
    ).toThrow();
  });

  it('builds chat completion body with system instruction and user prompt', () => {
    const config = promptOptimizeConfigSchema.parse(validConfigInput);
    const body = buildPromptOptimizeRequestBody(
      { operation: 'text_to_image', prompt: 'a red square' },
      config,
    );

    expect(body).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Rewrite the prompt.' },
        { role: 'user', content: 'a red square' },
      ],
    });
  });

  it('parses text content from chat completion response', () => {
    const text = parsePromptOptimizeResponse({
      choices: [{ message: { content: 'a vivid red square with studio lighting' } }],
    });

    expect(text).toBe('a vivid red square with studio lighting');
  });

  it('parses array-style content parts', () => {
    const text = parsePromptOptimizeResponse({
      choices: [{ message: { content: [{ type: 'text', text: 'optimized prompt' }] } }],
    });

    expect(text).toBe('optimized prompt');
  });

  it('rejects responses without text content', () => {
    expect(() => parsePromptOptimizeResponse({ choices: [{ message: {} }] })).toThrow(
      'Prompt optimize response did not contain any text content.',
    );
  });

  it('discovers models without image-only filtering', () => {
    const models = parsePromptOptimizeModelsResponse({
      data: [
        { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
        { id: 'google/gemini-2.5-flash-image-preview' },
      ],
    });

    expect(models.map((model) => model.id)).toEqual(['gpt-4o-mini', 'google/gemini-2.5-flash-image-preview']);
  });

  it('returns raw response and empty assets on invoke', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'optimized' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const provider = createPromptOptimizeProvider();
    const config = provider.validateConfig(validConfigInput);
    const request = provider.validateRequest({ operation: 'text_to_image', prompt: 'test' });

    const result = await provider.invoke({ config, request });

    expect(result.assets).toEqual([]);
    expect(result.raw).toEqual({ choices: [{ message: { content: 'optimized' } }] });
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://openrouter.ai/api/v1/chat/completions');
    fetchSpy.mockRestore();
  });
});

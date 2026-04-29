/**
 * Model 传递验证测试（无需真实网络）。
 *
 * 直接测试 `buildRequestBody` 函数的 model 三级优先级逻辑。
 */
import { describe, it, expect } from 'vitest';
import { buildRequestBody } from '@imagen-ps/providers/src/transport/openai-compatible/build-request.js';
import type { CanonicalImageJobRequest } from '@imagen-ps/providers/src/contract/request.js';

function makeRequest(overrides: Partial<CanonicalImageJobRequest> = {}): CanonicalImageJobRequest {
  return {
    operation: 'generate',
    prompt: 'a test image',
    ...overrides,
  };
}

describe('buildRequestBody model 三级优先级', () => {
  it('explicit providerOptions.model 优先级最高，覆盖 defaultModel', () => {
    const request = makeRequest({
      providerOptions: { model: 'gpt-4o' },
    });

    const body = buildRequestBody(request, 'dall-e-3');

    expect(body.model).toBe('gpt-4o');
  });

  it('defaultModel 作为 fallback（无 explicit model 时）', () => {
    const request = makeRequest({
      providerOptions: { response_format: 'b64_json' },
    });

    const body = buildRequestBody(request, 'dall-e-3');

    expect(body.model).toBe('dall-e-3');
  });

  it('硬编码 fallback 为 dall-e-3（无 explicit model 且无 defaultModel 时）', () => {
    const request = makeRequest();

    const body = buildRequestBody(request);

    expect(body.model).toBe('dall-e-3');
  });

  it('providerOptions 存在但 model 字段缺失时使用 defaultModel', () => {
    const request = makeRequest({
      providerOptions: { response_format: 'url' },
    });

    const body = buildRequestBody(request, 'custom-model-v2');

    expect(body.model).toBe('custom-model-v2');
  });

  it('providerOptions 为 undefined 时使用 defaultModel', () => {
    const request = makeRequest();

    const body = buildRequestBody(request, 'my-default');

    expect(body.model).toBe('my-default');
  });
});

describe('buildRequestBody providerOptions pass-through', () => {
  it('透传 response_format', () => {
    const request = makeRequest({
      providerOptions: { response_format: 'b64_json' },
    });

    const body = buildRequestBody(request);

    expect(body.response_format).toBe('b64_json');
  });

  it('默认 response_format 为 url', () => {
    const request = makeRequest();

    const body = buildRequestBody(request);

    expect(body.response_format).toBe('url');
  });

  it('透传其他 providerOptions 字段（排除 model 和 response_format）', () => {
    const request = makeRequest({
      providerOptions: {
        model: 'gpt-4o',
        response_format: 'url',
        user: 'test-user-123',
        quality: 'hd',
      },
    });

    const body = buildRequestBody(request);

    expect(body.model).toBe('gpt-4o');
    expect(body.response_format).toBe('url');
    expect(body.user).toBe('test-user-123');
    expect(body.quality).toBe('hd');
  });

  it('output.count 映射为 n', () => {
    const request = makeRequest({
      output: { count: 3 },
    });

    const body = buildRequestBody(request);

    expect(body.n).toBe(3);
  });

  it('output.width × height 映射为 size', () => {
    const request = makeRequest({
      output: { width: 1024, height: 1024 },
    });

    const body = buildRequestBody(request);

    expect(body.size).toBe('1024x1024');
  });
});

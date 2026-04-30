/**
 * openai-compatible models.ts 单元测试。
 *
 * 覆盖 `formatDisplayName` 和 `parseModelsResponse` 的所有 spec scenarios。
 */
import { describe, expect, it } from 'vitest';
import { formatDisplayName, parseModelsResponse } from '../src/transport/openai-compatible/models.js';

// ============================================================================
// formatDisplayName
// ============================================================================

describe('formatDisplayName', () => {
  it('formats dall-e-3', () => {
    expect(formatDisplayName('dall-e-3')).toBe('Dall E 3');
  });

  it('formats with underscores', () => {
    expect(formatDisplayName('flux_image_pro')).toBe('Flux Image Pro');
  });

  it('formats single word', () => {
    expect(formatDisplayName('dalle3')).toBe('Dalle3');
  });

  it('formats empty string', () => {
    expect(formatDisplayName('')).toBe('');
  });

  it('formats gpt-image-1', () => {
    expect(formatDisplayName('gpt-image-1')).toBe('Gpt Image 1');
  });

  it('formats grok-2-image', () => {
    expect(formatDisplayName('grok-2-image')).toBe('Grok 2 Image');
  });

  it('formats qwen-image-max', () => {
    expect(formatDisplayName('qwen-image-max')).toBe('Qwen Image Max');
  });
});

// ============================================================================
// parseModelsResponse
// ============================================================================

describe('parseModelsResponse', () => {
  // --- 成功场景 ---

  it('returns only image models from mixed response (dall-e + gpt-4)', () => {
    const raw = {
      object: 'list',
      data: [
        { id: 'dall-e-3', object: 'model', created: 1699809600, owned_by: 'openai-dev' },
        { id: 'gpt-4', object: 'model', created: 1687882411, owned_by: 'openai' },
      ],
    };

    const result = parseModelsResponse(raw);
    expect(result).toEqual([{ id: 'dall-e-3', displayName: 'Dall E 3' }]);
  });

  it('returns only image models from中转站 mixed response', () => {
    const raw = {
      object: 'list',
      data: [
        { id: 'gpt-image-1', object: 'model' },
        { id: 'gpt-4', object: 'model' },
        { id: 'grok-2-image', object: 'model' },
        { id: 'grok-2', object: 'model' },
        { id: 'qwen-image-max', object: 'model' },
        { id: 'qwen-max', object: 'model' },
      ],
    };

    const result = parseModelsResponse(raw);
    expect(result).toEqual([
      { id: 'gpt-image-1', displayName: 'Gpt Image 1' },
      { id: 'grok-2-image', displayName: 'Grok 2 Image' },
      { id: 'qwen-image-max', displayName: 'Qwen Image Max' },
    ]);
  });

  it('returns community image models (stable-diffusion-image, flux-image-pro)', () => {
    const raw = {
      object: 'list',
      data: [
        { id: 'stable-diffusion-image', object: 'model' },
        { id: 'flux-image-pro', object: 'model' },
        { id: 'gpt-4', object: 'model' },
      ],
    };

    const result = parseModelsResponse(raw);
    expect(result).toEqual([
      { id: 'stable-diffusion-image', displayName: 'Stable Diffusion Image' },
      { id: 'flux-image-pro', displayName: 'Flux Image Pro' },
    ]);
  });

  // --- 空数据场景 ---

  it('returns empty array for empty data', () => {
    const raw = { object: 'list', data: [] };
    const result = parseModelsResponse(raw);
    expect(result).toEqual([]);
  });

  // --- 无匹配场景 ---

  it('returns empty array when no image models match', () => {
    const raw = {
      object: 'list',
      data: [
        { id: 'gpt-4', object: 'model' },
        { id: 'text-embedding-ada-002', object: 'model' },
        { id: 'whisper-1', object: 'model' },
      ],
    };

    const result = parseModelsResponse(raw);
    expect(result).toEqual([]);
  });

  // --- 无效响应场景 ---

  it('throws invalid_response when raw is not an object', () => {
    expect(() => parseModelsResponse('not-an-object')).toThrow('Models response is not a JSON object');
  });

  it('throws invalid_response when raw is null', () => {
    expect(() => parseModelsResponse(null)).toThrow('Models response is not a JSON object');
  });

  it('throws invalid_response when object field is missing', () => {
    const raw = { data: [{ id: 'dall-e-3' }] };
    expect(() => parseModelsResponse(raw)).toThrow('missing or invalid "object" field');
  });

  it('throws invalid_response when object field is not "list"', () => {
    const raw = { object: 'other', data: [{ id: 'dall-e-3' }] };
    expect(() => parseModelsResponse(raw)).toThrow('missing or invalid "object" field');
  });

  it('throws invalid_response when data is not an array', () => {
    const raw = { object: 'list', data: 'not-an-array' };
    expect(() => parseModelsResponse(raw)).toThrow('"data" is not an array');
  });

  // --- 边界情况 ---

  it('skips non-object data items', () => {
    const raw = {
      object: 'list',
      data: ['string-item', { id: 'dall-e-3' }],
    };

    const result = parseModelsResponse(raw);
    expect(result).toEqual([{ id: 'dall-e-3', displayName: 'Dall E 3' }]);
  });

  it('skips data items missing id field', () => {
    const raw = {
      object: 'list',
      data: [{ object: 'model' }, { id: 'dall-e-3' }],
    };

    const result = parseModelsResponse(raw);
    expect(result).toEqual([{ id: 'dall-e-3', displayName: 'Dall E 3' }]);
  });

  it('returns empty array when all data items are non-object', () => {
    const raw = {
      object: 'list',
      data: ['a', 'b', 'c'],
    };

    const result = parseModelsResponse(raw);
    expect(result).toEqual([]);
  });

  it('returns empty array when all data items lack id', () => {
    const raw = {
      object: 'list',
      data: [{ object: 'model' }, { object: 'model' }],
    };

    const result = parseModelsResponse(raw);
    expect(result).toEqual([]);
  });
});

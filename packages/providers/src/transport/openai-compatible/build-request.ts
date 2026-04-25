/**
 * 将 `CanonicalImageJobRequest` 转换为 OpenAI-compatible HTTP request body。
 *
 * 当前阶段仅支持 images/generations 的同步调用。
 * edit 操作在请求层保留，但构造逻辑与 generate 一致（透传至 providerOptions）。
 */

import type { CanonicalImageJobRequest } from '../../contract/request.js';

/**
 * OpenAI-compatible images/generations 的请求 body。
 */
export interface OpenAIImageGenerationBody {
  /** 使用的 model target。 */
  model: string;

  /** 用户 prompt。 */
  prompt: string;

  /** 生成张数。 */
  n?: number;

  /** 图像尺寸。 */
  size?: string;

  /** 响应格式：url 或 b64_json。 */
  response_format?: 'url' | 'b64_json';

  /** 用户标识（可选）。 */
  user?: string;

  /** 其他透传字段。 */
  [key: string]: unknown;
}

/**
 * 从 width 与 height 推断 OpenAI-compatible size 字符串。
 *
 * 支持常见尺寸；若无法匹配则返回 undefined，让上游决定默认值。
 */
function inferSize(width: number | undefined, height: number | undefined): string | undefined {
  if (width === undefined || height === undefined) {
    return undefined;
  }

  const sizeMap: Record<string, string> = {
    '256x256': '256x256',
    '512x512': '512x512',
    '1024x1024': '1024x1024',
    '1792x1024': '1792x1024',
    '1024x1792': '1024x1792',
  };

  const key = `${width}x${height}`;
  return sizeMap[key];
}

/**
 * 构造 OpenAI-compatible HTTP request body。
 *
 * @param request 已校验的 canonical request
 * @param defaultModel provider config 中的默认 model
 */
export function buildRequestBody(
  request: CanonicalImageJobRequest,
  defaultModel?: string,
): OpenAIImageGenerationBody {
  const model =
    typeof request.providerOptions?.model === 'string'
      ? (request.providerOptions.model as string)
      : defaultModel ?? 'dall-e-3';

  const body: OpenAIImageGenerationBody = {
    model,
    prompt: request.prompt,
  };

  if (request.output?.count !== undefined) {
    body.n = request.output.count;
  }

  const size = inferSize(request.output?.width, request.output?.height);
  if (size !== undefined) {
    body.size = size;
  }

  // 默认使用 url 格式，可由 providerOptions 覆盖
  body.response_format =
    typeof request.providerOptions?.response_format === 'string'
      ? (request.providerOptions.response_format as 'url' | 'b64_json')
      : 'url';

  // 透传其他 providerOptions（排除已显式处理的字段）
  if (request.providerOptions) {
    for (const [key, value] of Object.entries(request.providerOptions)) {
      if (key !== 'model' && key !== 'response_format') {
        body[key] = value;
      }
    }
  }

  return body;
}

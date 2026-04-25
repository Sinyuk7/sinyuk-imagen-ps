/**
 * 解析 OpenAI-compatible images/generations 响应，归一化为 `Asset[]`。
 */

import type { Asset } from '@imagen-ps/core-engine';
import { mapInvalidResponseError } from './error-map.js';

/**
 * OpenAI API 返回的单条 image 数据。
 */
interface OpenAIImageData {
  /** 图片 URL。 */
  url?: string;

  /** Base64 编码的图片数据。 */
  b64_json?: string;

  /** 修订后的 prompt（若存在）。 */
  revised_prompt?: string;
}

/**
 * OpenAI images/generations 的标准响应结构。
 */
interface OpenAIImagesResponse {
  /** 创建时间戳。 */
  created?: number;

  /** 图片数据数组。 */
  data?: OpenAIImageData[];
}

/**
 * 解析上游响应 JSON 并归一化为 `Asset[]`。
 *
 * @param raw 原始响应数据
 * @returns 归一化后的 Asset 数组
 */
export function parseResponse(raw: unknown): Asset[] {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Response is not a JSON object.', { raw });
  }

  const response = raw as OpenAIImagesResponse;

  if (!Array.isArray(response.data)) {
    throw mapInvalidResponseError('Response missing "data" array.', { raw });
  }

  const assets: Asset[] = [];

  for (let i = 0; i < response.data.length; i++) {
    const item = response.data[i];

    if (typeof item !== 'object' || item === null) {
      throw mapInvalidResponseError(`Response data[${i}] is not an object.`, { raw, index: i });
    }

    if (item.url) {
      assets.push({
        type: 'image',
        name: `generated-${i + 1}.png`,
        url: item.url,
        mimeType: 'image/png',
      });
    } else if (item.b64_json) {
      assets.push({
        type: 'image',
        name: `generated-${i + 1}.png`,
        data: item.b64_json,
        mimeType: 'image/png',
      });
    } else {
      throw mapInvalidResponseError(
        `Response data[${i}] missing both "url" and "b64_json".`,
        { raw, index: i },
      );
    }
  }

  return assets;
}

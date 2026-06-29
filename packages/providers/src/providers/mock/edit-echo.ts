import type { Asset } from '@imagen-ps/core-engine';
import type { MockProviderRequest } from './request-schema.js';

/** 为带输入图的 image_edit 请求回显输入 asset，保留调用方提供的顺序与引用字段。 */
export function createMockImageEditEchoAssets(request: MockProviderRequest): Asset[] | undefined {
  if (request.operation !== 'image_edit' || request.images === undefined || request.images.length === 0) {
    return undefined;
  }

  return request.images.map((asset) => ({ ...asset }));
}

import type { ProviderDescriptor } from '../../contract/provider.js';

/**
 * Mock provider 的静态 descriptor。
 *
 * Mock 不参与任何真实 API format 的 canonical routing，也没有默认模型模板。
 */
export const mockDescriptor: ProviderDescriptor = {
  id: 'mock',
  family: 'image-endpoint',
  displayName: 'Mock Provider',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModelTemplates: [],
  billing: {
    query: 'unsupported',
  },
  connectivity: {
    endpointMeasurement: 'unsupported',
    connectionTest: 'unsupported',
  },
};

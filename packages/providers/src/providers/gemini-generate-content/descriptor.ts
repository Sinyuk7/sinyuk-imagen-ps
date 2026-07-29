import type { ProviderDescriptor } from '../../contract/provider.js';

/** Gemini Generate Content provider 的静态 descriptor。 */
export const geminiGenerateContentDescriptor: ProviderDescriptor = {
  id: 'gemini-generate-content',
  family: 'gemini-generate-content',
  apiFormat: 'gemini-generate-content',
  displayName: 'Gemini Generate Content',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModelTemplates: [
    { apiFormat: 'gemini-generate-content', modelId: 'nano-banana-fast', wireModelId: 'nano-banana-fast', baseModelId: 'nano-banana-fast' },
    { apiFormat: 'gemini-generate-content', modelId: 'gemini-3.1-flash-image', wireModelId: 'gemini-3.1-flash-image', baseModelId: 'gemini-3.1-flash-image' },
    { apiFormat: 'gemini-generate-content', modelId: 'gemini-3-pro-image', wireModelId: 'gemini-3-pro-image', baseModelId: 'gemini-3-pro-image' },
    { apiFormat: 'gemini-generate-content', modelId: 'gemini-3.1-flash-lite-image', wireModelId: 'gemini-3.1-flash-lite-image', baseModelId: 'gemini-3.1-flash-lite-image' },
  ],
  transport: {
    wire: {
      responseCodecs: ['json'],
    },
  },
  billing: {
    query: 'supported',
  },
  connectivity: {
    endpointMeasurement: 'supported',
    connectionTest: 'supported',
  },
};

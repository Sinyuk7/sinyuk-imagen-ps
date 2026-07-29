import type { ProviderDescriptor } from '../../contract/provider.js';

/** Chat image provider 的静态 descriptor。 */
export const chatImageDescriptor: ProviderDescriptor = {
  id: 'chat-image',
  family: 'chat-image',
  apiFormat: 'openai-chat-completions',
  displayName: 'Chat Image',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModelTemplates: [
    { apiFormat: 'openai-chat-completions', modelId: 'gemini-3-pro-image', wireModelId: 'gemini-3-pro-image', baseModelId: 'gemini-3-pro-image' },
    { apiFormat: 'openai-chat-completions', modelId: 'gemini-3.1-flash-image', wireModelId: 'gemini-3.1-flash-image', baseModelId: 'gemini-3.1-flash-image' },
    { apiFormat: 'openai-chat-completions', modelId: 'openai/gpt-image-2', wireModelId: 'openai/gpt-image-2', baseModelId: 'openai/gpt-image-2' },
  ],
  transport: {
    wire: {
      supportedImageRequestCodecs: ['chat-completions-image-legacy'],
      defaultImageRequestCodec: 'chat-completions-image-legacy',
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

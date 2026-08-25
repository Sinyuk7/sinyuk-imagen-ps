import type { ProviderDescriptor } from '../../contract/provider.js';
import { openAiImagesProfileTemplate } from './profile-template.js';
import { OPENAI_IMAGES_DEFAULT_MODEL_TEMPLATES } from './models.js';

/** Image endpoint provider 的静态 descriptor。 */
export const imageEndpointDescriptor: ProviderDescriptor = {
  id: 'image-endpoint',
  family: 'image-endpoint',
  apiFormat: 'openai-images',
  displayName: 'Image Endpoint',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModelTemplates: OPENAI_IMAGES_DEFAULT_MODEL_TEMPLATES,
  profileTemplate: openAiImagesProfileTemplate,
  transport: {
    wire: {
      supportedEditCodecs: ['multipart-bracket', 'multipart-plain', 'json-reference'],
      defaultEditCodecOrder: ['multipart-bracket', 'json-reference', 'multipart-plain'],
      responseCodecs: ['json'],
    },
  },
  billing: {
    query: 'supported',
  },
  connectivity: {
    endpointMeasurement: 'supported',
    connectionTest: 'unsupported',
  },
};

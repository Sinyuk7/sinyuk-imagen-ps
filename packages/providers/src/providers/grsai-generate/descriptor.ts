import type { ProviderDescriptor } from '../../contract/provider.js';

const template = (modelId: string, displayName: string) => ({ apiFormat: 'grsai' as const, modelId, wireModelId: modelId, baseModelId: modelId, displayName });

/** GRSAI Generate provider 的静态 descriptor。 */
export const grsaiGenerateDescriptor: ProviderDescriptor = {
  id: 'grsai-generate',
  family: 'grsai-generate',
  apiFormat: 'grsai',
  displayName: 'GRSAI Generate',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'async',
  defaultModelTemplates: [
    template('nano-banana-fast', 'Nano Banana 2 Lite'),
    template('nano-banana-2', 'Nano Banana 2'),
    template('nano-banana-2-cl', 'Nano Banana 2 CL'),
    template('nano-banana-2-2k-cl', 'Nano Banana 2 2K CL'),
    template('nano-banana-2-4k-cl', 'Nano Banana 2 4K CL'),
    template('nano-banana-pro', 'Nano Banana Pro'),
    template('nano-banana-pro-vt', 'Nano Banana Pro VT'),
    template('nano-banana-pro-cl', 'Nano Banana Pro CL'),
    template('nano-banana-pro-vip', 'Nano Banana Pro VIP'),
    template('nano-banana-pro-4k-vip', 'Nano Banana Pro 4K VIP'),
    template('gpt-image-2', 'GPT Image 2'),
    template('gpt-image-2-vip', 'GPT Image 2 VIP'),
  ].map(({ displayName: _displayName, ...value }) => value),
};

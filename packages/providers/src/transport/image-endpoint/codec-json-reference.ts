import type { ImageEditRequestCodec } from './build-request.js';

/** json-reference codec：使用 JSON body + 图片引用。 */
export const jsonReferenceCodec: ImageEditRequestCodec = {
  id: 'json-reference',
  wireSignature: {
    bodyKind: 'json',
    contentTypeKind: 'application/json',
    imageReferenceMode: 'reference',
  },
  reservedProviderOptionPaths: ['image', 'image[]', 'images', 'mask'],
  buildBody: (_request, context) => context.buildJsonBody(),
};

import type { ImageEditRequestCodec } from './build-request.js';

/** multipart-plain codec：使用 `image` 文件字段。 */
export const multipartPlainCodec: ImageEditRequestCodec = {
  id: 'multipart-plain',
  wireSignature: {
    bodyKind: 'multipart',
    contentTypeKind: 'multipart/form-data',
    imageFieldMode: 'image',
    imageReferenceMode: 'binary',
  },
  reservedProviderOptionPaths: ['image', 'image[]', 'images', 'mask'],
  buildBody: (_request, context) => context.buildMultipartBody('multipart-plain'),
};

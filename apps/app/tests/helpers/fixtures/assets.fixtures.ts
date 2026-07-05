import type { Asset } from '@imagen-ps/application';
import { createHostImageAsset } from '../../../src/shared/domain/host-image-asset';

export const fakeAsset: Asset = {
  type: 'image',
  name: 'result.png',
  data: 'ZmFrZS1pbWFnZQ==',
  mimeType: 'image/png',
};

export const fakeProviderInputBytes = new TextEncoder().encode('fake-provider-input');
export const fakeOutputBytes = new TextEncoder().encode('fake-image');

export const fakeProviderInputAsset: Asset = {
  type: 'image',
  name: 'input.png',
  mimeType: 'image/png',
  storedRef: {
    kind: 'hostObject',
    ref: 'fake-provider-input-1',
    name: 'input.png',
    mimeType: 'image/png',
    byteSize: fakeProviderInputBytes.byteLength,
  },
};

export const fakeOutputAsset: Asset = {
  type: 'image',
  name: 'result.png',
  mimeType: 'image/png',
  storedRef: {
    kind: 'hostObject',
    ref: 'fake-output-asset-1',
    name: 'result.png',
    mimeType: 'image/png',
    byteSize: fakeOutputBytes.byteLength,
  },
};

export const fakeHostImage = createHostImageAsset(fakeProviderInputAsset, {
  source: 'file',
  previewUrl: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
  payloadKind: 'host-object',
  payloadRef: fakeProviderInputAsset.storedRef?.ref,
});

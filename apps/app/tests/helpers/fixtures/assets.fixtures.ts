import type { Asset } from '@imagen-ps/application';
import { encode } from 'fast-png';
import { createHostImageAsset } from '../../../src/shared/domain/host-image-asset';

const SAMPLE_PNG_BYTES = encode({
  width: 1,
  height: 1,
  data: new Uint8Array([255, 255, 255, 255]),
});
const SAMPLE_PNG_BASE64 = Buffer.from(SAMPLE_PNG_BYTES).toString('base64');

export const fakeAsset: Asset = {
  type: 'image',
  name: 'result.png',
  data: SAMPLE_PNG_BASE64,
  mimeType: 'image/png',
};

export const fakeProviderInputBytes = SAMPLE_PNG_BYTES.slice(0);
export const fakeOutputBytes = SAMPLE_PNG_BYTES.slice(0);

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

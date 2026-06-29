import { describe, expect, it } from 'vitest';
import type { Asset, StoredAssetRef } from '@imagen-ps/application';
import { createHostImageAsset } from '../src/shared/domain/host-image-asset';
import { imageResourceFromAttachment, imageResourceFromHostImage, type ImageResource } from '../src/shared/domain/image-resource';
import type { PhotoshopCapturePlacement } from '../src/shared/domain/photoshop-placement';

const hostRef: StoredAssetRef = {
  kind: 'hostObject',
  ref: 'asset-store-input-1',
  name: 'input.png',
  mimeType: 'image/png',
  byteSize: 128,
};

const placement: PhotoshopCapturePlacement = {
  snapshot: {
    documentId: 42,
    documentSize: { width: 3000, height: 2000 },
    layerId: 7,
    layerBoundsNoEffects: { left: 10, top: 20, right: 1210, bottom: 820 },
    selectionBounds: null,
  },
  placementRect: { left: 10, top: 20, right: 1210, bottom: 820 },
  providerInputPlan: {
    sourceWidth: 1200,
    sourceHeight: 800,
    targetWidth: 1536,
    targetHeight: 1024,
    scale: 1.28,
    minSide: 1024,
    maxSide: 2048,
    multiple: 2,
    wasResized: true,
    wasUpscaled: true,
    wasDownscaled: false,
  },
};

function expectNoInlinePayload(value: unknown): void {
  expect(JSON.stringify(value)).not.toContain('data');
  expect(JSON.stringify(value)).not.toContain('ZmFrZS1pbWFnZQ==');
}

describe('image resource contract', () => {
  it('maps local file assets to one descriptor without retaining inline bytes', () => {
    const asset: Asset = {
      type: 'image',
      name: 'local.png',
      data: new Uint8Array([1, 2, 3, 4]),
      mimeType: 'image/png',
    };
    const image = createHostImageAsset(asset, {
      source: 'file',
      previewUrl: 'blob:local-preview',
      payloadKind: 'inline-asset',
    });

    expect(image.resource).toEqual({
      id: 'local.png',
      source: 'local-file',
      original: {
        name: 'local.png',
        mimeType: 'image/png',
        byteSize: 4,
      },
      derivatives: {
        thumbnail: {
          kind: 'ready',
          role: 'thumbnail',
          mimeType: 'image/png',
          previewUrl: 'blob:local-preview',
        },
        providerInput: {
          kind: 'pending',
          role: 'provider-input',
        },
      },
    } satisfies ImageResource);
    expectNoInlinePayload(image.resource);
  });

  it('maps Photoshop captures and layers to the same descriptor shape with placement metadata', () => {
    const asset: Asset = {
      type: 'image',
      name: 'capture.png',
      mimeType: 'image/png',
      storedRef: hostRef,
    };
    const image = createHostImageAsset(asset, {
      source: 'layer',
      previewUrl: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
      payloadKind: 'host-object',
      payloadRef: hostRef.ref,
      photoshopPlacement: placement,
    });

    const capture = imageResourceFromAttachment({
      id: 'attachment-capture',
      type: 'photoshop-capture',
      image,
      photoshopPlacement: placement,
    });
    const layer = imageResourceFromAttachment({
      id: 'attachment-layer',
      type: 'layer',
      image,
      photoshopPlacement: placement,
    });

    expect(capture.source).toBe('photoshop-capture');
    expect(layer.source).toBe('photoshop-layer');
    for (const resource of [capture, layer]) {
      expect(resource.original?.storedRef).toEqual(hostRef);
      expect(resource.derivatives.providerInput).toMatchObject({
        kind: 'ready',
        role: 'provider-input',
        width: 1536,
        height: 1024,
        mimeType: 'image/png',
        storedRef: hostRef,
      });
      expect(resource.placement).toEqual(placement);
      expectNoInlinePayload({ original: resource.original, providerInput: resource.derivatives.providerInput });
    }
  });

  it('represents provider outputs as resources with independent thumbnail and provider derivatives', () => {
    const outputRef: StoredAssetRef = {
      kind: 'hostObject',
      ref: 'provider-output-1',
      name: 'result.png',
      mimeType: 'image/png',
      byteSize: 512,
    };
    const image = createHostImageAsset(
      {
        type: 'image',
        name: 'result.png',
        mimeType: 'image/png',
        storedRef: outputRef,
      },
      {
        source: 'generated',
        previewUrl: 'blob:thumbnail-output-1',
        payloadKind: 'host-object',
        payloadRef: outputRef.ref,
      },
    );

    const resource = imageResourceFromHostImage('round-output-1', image);

    expect(resource).toMatchObject({
      id: 'round-output-1',
      source: 'provider-output',
      derivatives: {
        thumbnail: {
          kind: 'ready',
          role: 'thumbnail',
          previewUrl: 'blob:thumbnail-output-1',
        },
        providerInput: {
          kind: 'ready',
          role: 'provider-input',
          storedRef: outputRef,
        },
      },
    });
    expect(resource.derivatives.thumbnail).not.toBe(resource.derivatives.providerInput);
    expectNoInlinePayload(resource);
  });
});

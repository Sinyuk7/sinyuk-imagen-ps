import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  VALID_TRANSPARENT_PNG,
  createBridge,
  createFakeModules,
  providerPolicy,
  resolveAssetBytes,
  withObjectUrlMock,
} from '../../helpers/host-bridge-harness';

describe('PhotoshopHostBridge read contract', () => {
  it('creates releasable thumbnails for readable layers and skips unknown or empty layers', async () => withObjectUrlMock(async ({ revoke }) => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    const thumbnail = await bridge.getLayerThumbnail(2, 48);

    expect(thumbnail).toBeDefined();
    expect(thumbnail!.url).toBe('blob:thumb-1');
    expect(spies.getPixels).toHaveBeenCalledWith({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 48, height: 48 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    });
    thumbnail!.release();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');

    await expect(bridge.getLayerThumbnail(999)).resolves.toBeUndefined();
    await expect(bridge.getLayerThumbnail(3)).resolves.toBeUndefined();
  }));

  it('lists the layer tree while preserving lightweight picker metadata and hierarchy', async () => {
    const { modules } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.listLayers()).resolves.toEqual([
      {
        id: 1,
        name: 'Group',
        kind: 'group',
        visible: true,
        children: [
          {
            id: 2,
            name: 'Child',
            kind: 'pixel',
            visible: false,
          },
          {
            id: 3,
            name: 'Empty',
            kind: 'pixel',
            visible: true,
          },
        ],
      },
    ]);
  });

  it('prefers Photoshop core.getLayerTree when available for lightweight picker reads', async () => {
    const { modules } = createFakeModules();
    const getLayerTree = vi.fn(async () => ({
      list: [
        {
          layerID: 11,
          name: 'Core Group',
          type: 'group',
          visible: true,
          list: [
            {
              layerID: 12,
              name: 'Core Child',
              type: 'pixel',
              visible: false,
            },
          ],
        },
      ],
    }));
    (modules.photoshop!.core as { getLayerTree?: typeof getLayerTree }).getLayerTree = getLayerTree;
    const { bridge } = createBridge(modules);

    await expect(bridge.listLayers()).resolves.toEqual([
      {
        id: 11,
        name: 'Core Group',
        kind: 'group',
        visible: true,
        children: [
          {
            id: 12,
            name: 'Core Child',
            kind: 'pixel',
            visible: false,
          },
        ],
      },
    ]);
    expect(getLayerTree).toHaveBeenCalledWith({ documentID: 42 });
  });

  it('keeps layer thumbnails on real DOM layers after getLayerTree-backed listing', async () => withObjectUrlMock(async () => {
    const { modules, spies } = createFakeModules();
    const getLayerTree = vi.fn(async () => ({
      list: [
        {
          layerID: 1,
          name: 'Core Group',
          type: 'group',
          visible: true,
          list: [
            {
              layerID: 2,
              name: 'Core Child',
              type: 'pixel',
              visible: false,
            },
          ],
        },
      ],
    }));
    (modules.photoshop!.core as { getLayerTree?: typeof getLayerTree }).getLayerTree = getLayerTree;
    const { bridge } = createBridge(modules);

    await bridge.listLayers();
    const thumbnail = await bridge.getLayerThumbnail(2, 48);

    expect(thumbnail?.url).toBe('blob:thumb-1');
    expect(spies.getPixels).toHaveBeenCalledWith({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 48, height: 48 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: false,
    });
  }));

  it('does not touch heavy bounds or mask metadata while listing picker layers', async () => {
    const { modules } = createFakeModules();
    const { bridge } = createBridge(modules);
    const group = (modules.photoshop?.app.activeDocument?.layers?.[0] ?? null) as
      | { layers?: Array<Record<string, unknown>> }
      | null;
    const listedLayers = group?.layers ?? [];
    const child = listedLayers[0];
    const empty = listedLayers[1];
    if (!child || !empty) {
      throw new Error('Expected fake layer tree.');
    }

    Object.defineProperty(child, 'hasUserMask', {
      configurable: true,
      get() {
        throw new Error('listLayers should not read hasUserMask');
      },
    });
    Object.defineProperty(child, 'bounds', {
      configurable: true,
      get() {
        throw new Error('listLayers should not read bounds');
      },
    });
    Object.defineProperty(empty, 'bounds', {
      configurable: true,
      get() {
        throw new Error('listLayers should not read empty-layer bounds');
      },
    });

    await expect(bridge.listLayers()).resolves.toMatchObject([
      {
        id: 1,
        children: [
          { id: 2, name: 'Child' },
          { id: 3, name: 'Empty' },
        ],
      },
    ]);
  });

  it('reads layer pixels into host-owned assets with placement metadata and provider-input derivatives', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge, assetStore } = createBridge(modules);

    const layerAsset = await bridge.readLayerAsAsset(2, providerPolicy);

    expect(layerAsset).toMatchObject({
      asset: { type: 'image', name: 'layer-2.png', mimeType: 'image/png' },
      metadata: { source: 'layer', name: 'layer-2.png', mimeType: 'image/png' },
      payload: { kind: 'host-object' },
      photoshopPlacement: {
        snapshot: {
          documentId: 42,
          documentSize: { width: 512, height: 384 },
          layerId: 2,
          layerBoundsNoEffects: { left: 0, top: 0, right: 64, bottom: 64 },
          selectionBounds: null,
        },
        placementRect: { left: 0, top: 0, right: 64, bottom: 64 },
        providerInputPlan: expect.objectContaining({
          kind: 'passthrough',
          sourceSize: { width: 64, height: 64 },
          targetSize: { width: 64, height: 64 },
          aspectRatioError: 0,
        }),
      },
    });
    expect((await resolveAssetBytes(assetStore, layerAsset.asset)).slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    expect(layerAsset.resource.derivatives.thumbnail).toMatchObject({
      kind: 'ready',
      role: 'thumbnail',
      mimeType: 'image/png',
    });
    expect(layerAsset.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 64,
      height: 64,
      mimeType: 'image/png',
    });
    expect(spies.getPixels).toHaveBeenNthCalledWith(1, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 64, height: 64 },
    }));
    expect(spies.getPixels).toHaveBeenNthCalledWith(2, expect.objectContaining({
      documentID: 42,
      layerID: 2,
      targetSize: { width: 64, height: 64 },
    }));
  });

  it('captures provider input before background JPEG preview is ready', async () => withObjectUrlMock(async ({ revoke }) => {
    const { modules, spies } = createFakeModules();
    const { bridge, assetStore } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);

    expect(capture.image.preview.kind).toBe('none');
    expect(capture.image.resource.derivatives.thumbnail).toBeUndefined();
    expect(capture.image.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      role: 'provider-input',
      width: 64,
      height: 64,
      mimeType: 'image/png',
    });
    expect((await resolveAssetBytes(assetStore, capture.image.asset)).slice(0, 8)).toEqual(VALID_TRANSPARENT_PNG.slice(0, 8));
    expect(spies.encodeImageData).not.toHaveBeenCalled();

    const preview = await capture.previewTask?.();

    expect(preview).toMatchObject({
      kind: 'object-url',
      url: 'blob:thumb-1',
    });
    expect(spies.getPixels).toHaveBeenLastCalledWith({
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      targetSize: { width: 64, height: 64 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: true,
    });
    expect(spies.encodeImageData).toHaveBeenCalledWith({
      imageData: expect.any(Object),
      base64: false,
    });
    preview?.dispose?.();
    expect(revoke).toHaveBeenCalledWith('blob:thumb-1');
  }));

  it('does not use selection mask composition for background capture preview', async () => withObjectUrlMock(async () => {
    const { modules, spies } = createFakeModules({
      selectionBounds: { left: 4, top: 6, right: 44, bottom: 54 },
    });
    const { bridge } = createBridge(modules);

    const capture = await bridge.captureActiveImage({ maxSide: 1024 });
    expect(spies.getSelection).toHaveBeenCalledTimes(1);

    await expect(capture.previewTask?.()).resolves.toBeDefined();

    expect(spies.getSelection).toHaveBeenCalledTimes(1);
    expect(spies.getPixels).toHaveBeenLastCalledWith({
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 4, top: 6, right: 44, bottom: 54 },
      targetSize: { width: 40, height: 48 },
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: true,
    });
  }));

  it('keeps placeholder when capture-bound preview source disappears', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    const capture = await bridge.captureActiveImage(providerPolicy);
    (modules.photoshop!.app as { activeDocument?: unknown }).activeDocument = {
      id: 99,
      layers: [],
      activeLayers: [],
      selection: { bounds: null },
    };

    await expect(capture.previewTask?.()).resolves.toBeUndefined();

    expect(spies.encodeImageData).not.toHaveBeenCalled();
  });

  it('fails closed when Photoshop getPixels returns a size outside the requested targetSize', async () => {
    const { modules } = createFakeModules({
      pixelResultSize: { width: 63, height: 64 },
    });
    const { bridge } = createBridge(modules);

    await expect(bridge.readLayerAsAsset(2, providerPolicy)).rejects.toThrow(
      'Photoshop returned unexpected capture size: 63x64, expected 64x64.',
    );
  });

  it('fails closed when Photoshop getSelection returns a size outside the requested targetSize', async () => {
    const { modules } = createFakeModules({
      selectionBounds: { left: 4, top: 6, right: 44, bottom: 54 },
      selectionResultSize: { width: 39, height: 48 },
    });
    const { bridge } = createBridge(modules);

    await expect(bridge.captureActiveImage({ maxSide: 1024 })).rejects.toThrow(
      'Photoshop returned unexpected selection mask size: 39x48, expected 40x48.',
    );
  });

  it('keeps local image ingestion on the app path when possible and rejects structurally unsafe picker assets', async () => {
    const tiny = createFakeModules({
      pickedFileName: 'tiny.png',
      pickedFileData: VALID_TRANSPARENT_PNG.buffer.slice(0),
    });
    const tinyBridge = createBridge(tiny.modules).bridge;

    const tinyAsset = await tinyBridge.pickImageFile(providerPolicy);
    expect(tinyAsset?.asset).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
    });

    const unsafe = createFakeModules({
      pickedFileName: 'picked.png',
      pickedFileData: new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]).buffer,
    });
    const unsafeBridge = createBridge(unsafe.modules).bridge;

    await expect(unsafeBridge.pickImageFile(providerPolicy)).rejects.toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_TRUNCATED_MOCK_PNG,
  VALID_TRANSPARENT_PNG,
  arrayBufferFromBytes,
  createBridge,
  createFakeModules,
  createHostModalRunner,
  createInMemoryAssetStore,
  createPhotoshopHostBridge,
  decodePng,
  pngWithSize,
  realJpegWithSize,
  resolveAssetBytes,
} from '../../helpers/host-bridge-harness';
import { createLogger, createMemorySink, createNullLogger as foundationNullLogger } from '@imagen-ps/foundation';

describe('PhotoshopHostBridge write contract', () => {
  it('placeAssetOnCanvas generates temporary file/session token and calls placeEvent inside a modal', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
    });

    expect(spies.createFile).toHaveBeenCalledWith(expect.stringMatching(/^imagen-ps-\d+\.png$/), { overwrite: true });
    expect(spies.writeTempFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), { format: 'binary' });
    expect(spies.createSessionToken).toHaveBeenCalledTimes(1);
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Place generated image' });
    expect(spies.batchPlay).toHaveBeenCalledWith(
      [
        {
          _obj: 'placeEvent',
          null: {
            _path: 'session-token-1',
            _kind: 'local',
          },
        },
      ],
      { synchronousExecution: false },
    );
    expect(spies.deleteTempFile).toHaveBeenCalledTimes(1);
  });

  it('resolves hostObject and URL storedRefs before writing the temporary file', async () => {
    const { modules, spies } = createFakeModules();
    const assetStore = createInMemoryAssetStore();
    const storedRef = await assetStore.put(arrayBufferFromBytes(VALID_TRANSPARENT_PNG), {
      mimeType: 'image/png',
      name: 'stored.png',
    });
    const bridge = createPhotoshopHostBridge(modules, { assetStore });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response(arrayBufferFromBytes(VALID_TRANSPARENT_PNG), {
      headers: { 'content-type': 'image/png' },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await bridge.placeAssetOnCanvas({
        type: 'image',
        name: 'stored.png',
        mimeType: 'image/png',
        storedRef,
      }, {
        kind: 'document-only',
        documentId: 42,
        documentSizeAtCapture: { width: 512, height: 384 },
      });

      await bridge.placeAssetOnCanvas({
        type: 'image',
        name: 'remote.png',
        mimeType: 'image/png',
        url: 'https://example.test/remote.png',
        storedRef: {
          kind: 'url',
          ref: 'https://example.test/remote.png',
          name: 'remote.png',
          mimeType: 'image/png',
        },
      }, {
        kind: 'document-only',
        documentId: 42,
        documentSizeAtCapture: { width: 512, height: 384 },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/remote.png');
    expect(spies.writeTempFile).toHaveBeenCalled();
    expect(spies.batchPlay).toHaveBeenCalledTimes(2);
  });

  it('applies exact-frame placement by targeting the capture document and transforming the placed layer', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'exact-frame',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 10, top: 20, right: 138, bottom: 148 },
      outputSelection: {
        geometry: { kind: 'pixels', width: 1, height: 1 },
        outputFormat: 'png',
      },
    });

    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
    expect(spies.scalePlacedLayer).toHaveBeenCalledWith(200, 200);
    expect(spies.translatePlacedLayer).toHaveBeenCalledWith(10, 20);
  });

  it('normalizes unbound JPEG placement to intrinsic pixels on large canvases', async () => {
    const { modules, spies } = createFakeModules({
      activeLayerBounds: { _left: 0, _top: 0, _right: 128, _bottom: 96 },
    });
    const activeDocument = modules.photoshop?.app.activeDocument as { width?: number; height?: number };
    activeDocument.width = 4096;
    activeDocument.height = 4096;
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.jpg',
      data: realJpegWithSize(1024, 768),
      mimeType: 'image/jpeg',
    }, {
      kind: 'unbound',
      reason: 'no-photoshop-capture',
    });

    expect(spies.scalePlacedLayer).toHaveBeenCalledWith(800, 800);
    expect(spies.translatePlacedLayer).not.toHaveBeenCalled();
  });

  it('fits unbound placement back into the active document when intrinsic pixels exceed canvas', async () => {
    const { modules, spies } = createFakeModules({
      activeLayerBounds: { _left: 0, _top: 0, _right: 128, _bottom: 96 },
    });
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.jpg',
      data: realJpegWithSize(1024, 768),
      mimeType: 'image/jpeg',
    }, {
      kind: 'unbound',
      reason: 'no-photoshop-capture',
    });

    expect(spies.scalePlacedLayer).toHaveBeenCalledWith(400, 400);
    expect(spies.translatePlacedLayer).not.toHaveBeenCalled();
  });

  it('logs host placement normalization facts for unbound placement RCA', async () => {
    const { modules } = createFakeModules({
      activeLayerBounds: { _left: 0, _top: 0, _right: 128, _bottom: 96 },
    });
    const activeDocument = modules.photoshop?.app.activeDocument as { width?: number; height?: number; resolution?: number };
    activeDocument.width = 4096;
    activeDocument.height = 4096;
    activeDocument.resolution = 300;
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'uxp', package: 'app', component: 'host' },
    });
    const bridge = createPhotoshopHostBridge(modules, {
      assetStore: createInMemoryAssetStore(),
      logger,
    });

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.jpg',
      data: realJpegWithSize(1024, 768),
      mimeType: 'image/jpeg',
    }, {
      kind: 'unbound',
      reason: 'no-photoshop-capture',
    });

    const successRecord = sink.records.find((record) => record.event === 'hostbridge.place_asset.ok');
    expect(successRecord?.attrs).toMatchObject({
      placement: 'unbound',
      placementReason: 'no-photoshop-capture',
      targetDocumentId: 42,
      targetDocumentWidth: 4096,
      targetDocumentHeight: 4096,
      targetDocumentResolution: 300,
      assetWidth: 1024,
      assetHeight: 768,
      placedLayerBoundsAfterPlaceWidth: 128,
      placedLayerBoundsAfterPlaceHeight: 96,
      normalizedTargetWidth: 1024,
      normalizedTargetHeight: 768,
      placedLayerBoundsAfterNormalizeWidth: 128,
      placedLayerBoundsAfterNormalizeHeight: 96,
    });
  });

  it('logs stable capture failure context for host RCA', async () => {
    const { modules, spies } = createFakeModules({
      selectionBounds: { left: 4, top: 6, right: 44, bottom: 54 },
    });
    spies.getPixels.mockRejectedValueOnce(new Error('Photoshop Error. Code: -32005. Message: Could not import the clipboard ^0.'));
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'uxp', package: 'app', component: 'host' },
    });
    const bridge = createPhotoshopHostBridge(modules, {
      assetStore: createInMemoryAssetStore(),
      logger,
    });

    await expect(bridge.captureActiveImage({ maxSide: 1024 })).rejects.toThrow('Could not import the clipboard');

    const failureRecord = sink.records.find((record) => record.event === 'hostbridge.capture_active_image.fail');
    expect(failureRecord?.attrs).toMatchObject({
      documentId: 42,
      documentWidth: 512,
      documentHeight: 384,
      activeLayerCount: 1,
      layerId: 2,
      layerName: 'Child',
      layerKind: 'pixel',
      sourceKind: 'selection',
      captureRectLeft: 4,
      captureRectTop: 6,
      captureRectRight: 44,
      captureRectBottom: 54,
      captureSizeWidth: 40,
      captureSizeHeight: 48,
      thumbnailTargetWidth: 40,
      thumbnailTargetHeight: 48,
      providerInputTargetWidth: 40,
      providerInputTargetHeight: 48,
      failedStage: 'read-capture-pixels',
    });
    expect(failureRecord?.error).toMatchObject({
      message: 'Photoshop Error. Code: -32005. Message: Could not import the clipboard ^0.',
    });
  });

  it('stores capture provider input with the UXP-safe stored-deflate PNG encoder', async () => {
    const { modules } = createFakeModules();
    const sink = createMemorySink();
    const logger = createLogger({
      sink,
      context: { surface: 'uxp', package: 'app', component: 'host' },
    });
    const assetStore = createInMemoryAssetStore();
    const bridge = createPhotoshopHostBridge(modules, {
      assetStore,
      logger,
    });

    const capture = await bridge.captureActiveImage({ maxSide: 64 });
    const bytes = await resolveAssetBytes(assetStore, capture.image.asset);
    const decoded = decodePng(bytes);

    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(64);
    expect(capture.image.resource.derivatives.providerInput).toMatchObject({
      kind: 'ready',
      width: 64,
      height: 64,
      mimeType: 'image/png',
    });
    const successRecord = sink.records.find((record) => record.event === 'hostbridge.capture_active_image.ok');
    expect(successRecord?.attrs).toMatchObject({
      'providerInput.encoder': 'stored-deflate',
      'providerInput.rgbaBytes': 64 * 64 * 4,
      'providerInput.getPixelsMs': expect.any(Number),
      'providerInput.getDataMs': expect.any(Number),
      'providerInput.transformMs': expect.any(Number),
      'providerInput.encodeMs': expect.any(Number),
      'providerInput.storeMs': expect.any(Number),
      'providerInput.pngBytes': bytes.byteLength,
      'capture.readyMs': expect.any(Number),
    });
    expect(successRecord?.attrs).not.toHaveProperty('providerInput.fallbackReason');
  });

  it('accepts document-only placement without transform and downgrades unverifiable exact-frame output to document-only', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: pngWithSize(1016, 946),
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
    });

    expect(spies.scalePlacedLayer).not.toHaveBeenCalled();
    expect(spies.translatePlacedLayer).not.toHaveBeenCalled();

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: pngWithSize(1016, 946),
      mimeType: 'image/png',
    }, {
      kind: 'exact-frame',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 0, top: 0, right: 345, bottom: 321 },
    });

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: pngWithSize(1016, 946),
      mimeType: 'image/png',
    }, {
      kind: 'exact-frame',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 0, top: 0, right: 345, bottom: 321 },
      outputSelection: {
        geometry: { kind: 'pixels', width: 345, height: 321 },
        outputFormat: 'png',
      },
    });

    expect(spies.scalePlacedLayer).not.toHaveBeenCalled();
    expect(spies.translatePlacedLayer).not.toHaveBeenCalled();
  });

  it('rejects ambiguous and weak reopened document matches before Photoshop write', async () => {
    const ambiguousModules = createFakeModules().modules;
    const ambiguousApp = ambiguousModules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    ambiguousApp.activeDocument = undefined;
    ambiguousApp.documents = [
      { id: 99, name: 'source.psd', width: 512, height: 384 },
      { id: 100, name: 'source.psd', width: 512, height: 384 },
    ];
    const ambiguousBridge = createBridge(ambiguousModules).bridge;

    await expect(ambiguousBridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentName: 'source.psd',
      documentSizeAtCapture: { width: 512, height: 384 },
    })).rejects.toThrow('ambiguous across 2 documents');

    const weakModules = createFakeModules().modules;
    const weakApp = weakModules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    weakApp.activeDocument = undefined;
    weakApp.documents = [{ id: 99, name: 'source.psd', width: 512, height: 384 }];
    const weakBridge = createBridge(weakModules).bridge;

    await expect(weakBridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentName: 'source.psd',
      documentSizeAtCapture: { width: 512, height: 384 },
    })).rejects.toThrow('weak document match requires explicit confirmation');
  });

  it('rejects unsafe PNG bytes before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(
      bridge.placeAssetOnCanvas({
        type: 'image',
        name: 'legacy-mock.png',
        data: LEGACY_TRUNCATED_MOCK_PNG,
        mimeType: 'image/png',
      }, {
        kind: 'document-only',
        documentId: 42,
        documentSizeAtCapture: { width: 512, height: 384 },
      }),
    ).rejects.toThrow('PNG asset chunk CRC is invalid.');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('serializes modal operations and fails clearly when the modal slot never becomes available', async () => {
    const { modules, spies } = createFakeModules();
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    spies.executeAsModal
      .mockImplementationOnce(async (callback: () => Promise<unknown>) => {
        order.push('first-start');
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        const result = await callback();
        order.push('first-end');
        return result;
      })
      .mockImplementationOnce(async (callback: () => Promise<unknown>) => {
        order.push('second-start');
        const result = await callback();
        order.push('second-end');
        return result;
      });
    const { bridge } = createBridge(modules);

    const first = bridge.readLayerAsAsset(2, { maxSide: 2048 });
    const second = bridge.readLayerMaskAsAsset(2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(['first-start']);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);

    vi.useFakeTimers();
    try {
      const executeAsModal = vi.fn(async () => undefined);
      const runHostModal = createHostModalRunner(
        {
          executeAsModal,
          isModal: () => true,
        },
        foundationNullLogger(),
      );

      const pending = runHostModal(async () => undefined, { commandName: 'Blocked modal' });
      const rejection = expect(pending).rejects.toThrow('Photoshop modal state did not become available.');
      await vi.runAllTimersAsync();
      await rejection;
      expect(executeAsModal).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

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
  pngWithSize,
} from '../../helpers/host-bridge-harness';
import { createNullLogger as foundationNullLogger } from '@imagen-ps/foundation';

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
    });

    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
    expect(spies.scalePlacedLayer).toHaveBeenCalledWith(200, 200);
    expect(spies.translatePlacedLayer).toHaveBeenCalledWith(10, 20);
  });

  it('accepts document-only placement without transform and rejects incompatible exact-frame ratio before Photoshop write', async () => {
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

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: pngWithSize(1016, 946),
      mimeType: 'image/png',
    }, {
      kind: 'exact-frame',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 0, top: 0, right: 345, bottom: 321 },
    })).rejects.toThrow('Exact-frame placement requires matching aspect ratio');
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

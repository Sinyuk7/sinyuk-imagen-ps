import { describe, expect, it } from 'vitest';
import {
  LEGACY_TRUNCATED_MOCK_PNG,
  VALID_TRANSPARENT_PNG,
  arrayBufferFromBytes,
  createBridge,
  createFakeModules,
  createInMemoryAssetStore,
  createPhotoshopHostBridge,
  pngWithSize,
} from './host-bridge-harness';

describe('PhotoshopHostBridge fake harness — placement', () => {
  it('placeAssetOnCanvas 生成 temporary file/session token 并在 modal 内调用 placeEvent', async () => {
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

  it('unbound no-photoshop-capture placement targets the active Photoshop document', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'unbound',
      reason: 'no-photoshop-capture',
    });

    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
    expect(spies.createFile).toHaveBeenCalledWith(expect.stringMatching(/^imagen-ps-\d+\.png$/), { overwrite: true });
  });

  it('unbound no-photoshop-capture placement rejects missing active Photoshop document', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    app.activeDocument = undefined;
    app.documents = [];
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'unbound',
      reason: 'no-photoshop-capture',
    })).rejects.toThrow('requires an active Photoshop document');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('unbound multiple-documents placement rejects before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'unbound',
      reason: 'multiple-documents',
    })).rejects.toThrow('ambiguous across multiple source documents');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placeAssetOnCanvas resolves hostObject storedRef before writing the temporary file', async () => {
    const { modules, spies } = createFakeModules();
    const assetStore = createInMemoryAssetStore();
    const storedRef = await assetStore.put(arrayBufferFromBytes(VALID_TRANSPARENT_PNG), {
      mimeType: 'image/png',
      name: 'stored.png',
    });
    const bridge = createPhotoshopHostBridge(modules, { assetStore });

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

    expect(spies.writeTempFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), { format: 'binary' });
    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
  });

  it('exact-frame placement targets capture document and transforms the placed layer', async () => {
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

  it('document-only placement accepts provider-owned output ratio without transform', async () => {
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

    expect(spies.batchPlay).toHaveBeenCalledTimes(1);
    expect(spies.scalePlacedLayer).not.toHaveBeenCalled();
    expect(spies.translatePlacedLayer).not.toHaveBeenCalled();
  });

  it('exact-frame placement rejects provider output ratio mismatch before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);

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

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('exact-frame placement rejects document mismatch before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: { width?: number; height?: number } };
    app.activeDocument = { ...app.activeDocument, width: 256, height: 384 };
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'exact-frame',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
      placementRect: { left: 10, top: 20, right: 138, bottom: 148 },
    })).rejects.toThrow('document mismatch');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placement rejects missing document before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    app.activeDocument = undefined;
    app.documents = [];
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
    }, {
      kind: 'document-only',
      documentId: 42,
      documentSizeAtCapture: { width: 512, height: 384 },
    })).rejects.toThrow('no longer available');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placement rejects ambiguous reopened document matches before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    app.activeDocument = undefined;
    app.documents = [
      { id: 99, name: 'source.psd', width: 512, height: 384 },
      { id: 100, name: 'source.psd', width: 512, height: 384 },
    ];
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
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

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placement rejects weak reopened document matches before Photoshop write', async () => {
    const { modules, spies } = createFakeModules();
    const app = modules.photoshop?.app as { activeDocument?: unknown; documents?: readonly unknown[] };
    app.activeDocument = undefined;
    app.documents = [
      { id: 99, name: 'source.psd', width: 512, height: 384 },
    ];
    const { bridge } = createBridge(modules);

    await expect(bridge.placeAssetOnCanvas({
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

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('placeAssetOnCanvas 拒绝旧 mock 坏 PNG，避免进入 Photoshop placeEvent', async () => {
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
    expect(spies.writeTempFile).not.toHaveBeenCalled();
    expect(spies.createSessionToken).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });
});

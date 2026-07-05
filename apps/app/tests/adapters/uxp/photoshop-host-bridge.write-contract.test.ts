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
  providerPolicy,
} from '../../helpers/host-bridge-harness';
import { createNullLogger as foundationNullLogger } from '@imagen-ps/foundation';

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

  it('placeAssetOnCanvas fetches URL storedRefs before writing the temporary file', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response(arrayBufferFromBytes(VALID_TRANSPARENT_PNG), {
      headers: { 'content-type': 'image/png' },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
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
    expect(spies.writeTempFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), { format: 'binary' });
    expect(new Uint8Array(spies.writeTempFile.mock.calls[0]?.[0] as ArrayBuffer)).toEqual(VALID_TRANSPARENT_PNG);
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


it('串行执行 Photoshop modal 操作，避免并发 executeAsModal 互相踩踏', async () => {
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

    const first = bridge.readLayerAsAsset(2, providerPolicy);
    const second = bridge.readLayerMaskAsAsset(2);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(['first-start']);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    expect(spies.setExecutionMode).toHaveBeenCalledWith({ enableErrorStacktraces: true });
  });

  it('modal slot 长时间不可用时返回清晰错误而不是永久等待', async () => {
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

  it('依赖缺失时返回不会触碰 Photoshop/UXP 的 stub bridge', async () => {
    const { bridge } = createBridge({});

    await expect(bridge.listLayers()).resolves.toEqual([]);
    await expect(bridge.pickImageFile(providerPolicy)).resolves.toBeUndefined();
    await expect(bridge.readLayerMaskAsAsset(1)).resolves.toBeUndefined();
    await expect(bridge.readLayerAsAsset(1, providerPolicy)).rejects.toThrow('unavailable outside UXP');
    await expect(bridge.captureActiveImage(providerPolicy)).rejects.toThrow('unavailable outside UXP');
    await expect(bridge.placeAssetOnCanvas({ type: 'image' }, { kind: 'unbound', reason: 'no-photoshop-capture' })).rejects.toThrow('unavailable outside UXP');
    await expect(bridge.saveAssetToFile({ type: 'image' })).rejects.toThrow('File save is unavailable');
  });


it('通过 UXP 保存对话框把 hostObject 原图写到电脑文件', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge, assetStore } = createBridge(modules);
    const storedRef = await assetStore.put(VALID_TRANSPARENT_PNG.buffer.slice(0), {
      mimeType: 'image/png',
      name: 'history-full.png',
    });

    await bridge.saveAssetToFile({
      type: 'image',
      name: 'history-full.png',
      mimeType: 'image/png',
      storedRef,
    }, { suggestedName: 'downloaded-history' });

    expect(spies.getFileForSaving).toHaveBeenCalledWith('downloaded-history.png', {
      types: ['png'],
    });
    expect(spies.writeSavedFile).toHaveBeenCalledTimes(1);
    expect(spies.writeSavedFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), { format: 'binary' });
    expect(new Uint8Array(spies.writeSavedFile.mock.calls[0]?.[0] as ArrayBuffer)).toEqual(VALID_TRANSPARENT_PNG);
  });

  it('通过同一保存入口下载 URL storedRef 原图', async () => {
    const { modules, spies } = createFakeModules();
    const { bridge } = createBridge(modules);
    const originalFetch = globalThis.fetch;
    const fetchBytes = new Uint8Array([9, 8, 7, 6]);
    globalThis.fetch = vi.fn(async () => new Response(arrayBufferFromBytes(fetchBytes), {
      headers: { 'content-type': 'image/png' },
    })) as unknown as typeof fetch;

    try {
      await bridge.saveAssetToFile({
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
      }, { suggestedName: 'downloaded-remote' });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(spies.getFileForSaving).toHaveBeenCalledWith('downloaded-remote.png', {
      types: ['png'],
    });
    expect(spies.writeSavedFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), { format: 'binary' });
    expect(new Uint8Array(spies.writeSavedFile.mock.calls[0]?.[0] as ArrayBuffer)).toEqual(fetchBytes);
  });

  it('用户取消保存时静默返回，不写文件', async () => {
    const { modules, spies } = createFakeModules();
    spies.getFileForSaving.mockResolvedValueOnce(undefined);
    const { bridge, assetStore } = createBridge(modules);
    const storedRef = await assetStore.put(VALID_TRANSPARENT_PNG.buffer.slice(0), {
      mimeType: 'image/png',
      name: 'cancelled.png',
    });

    await expect(bridge.saveAssetToFile({
      type: 'image',
      name: 'cancelled.png',
      mimeType: 'image/png',
      storedRef,
    })).resolves.toBeUndefined();

    expect(spies.writeSavedFile).not.toHaveBeenCalled();
  });
});

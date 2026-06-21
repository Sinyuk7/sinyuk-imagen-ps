import { describe, expect, it, vi } from 'vitest';
import { createPhotoshopHostBridge } from './photoshop-host-bridge';
import type { UxpModules } from './uxp-api';

function arrayBufferFromText(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

const VALID_TRANSPARENT_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x60,
  0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0xa5, 0xf6,
  0x45, 0x40, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const LEGACY_TRUNCATED_MOCK_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00,
  0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function createFakeModules(): {
  readonly modules: UxpModules;
  readonly spies: {
    readonly getPixels: ReturnType<typeof vi.fn>;
    readonly getLayerMask: ReturnType<typeof vi.fn>;
    readonly encodeImageData: ReturnType<typeof vi.fn>;
    readonly disposeLayer: ReturnType<typeof vi.fn>;
    readonly disposeMask: ReturnType<typeof vi.fn>;
    readonly getFileForOpening: ReturnType<typeof vi.fn>;
    readonly createFile: ReturnType<typeof vi.fn>;
    readonly writeTempFile: ReturnType<typeof vi.fn>;
    readonly createSessionToken: ReturnType<typeof vi.fn>;
    readonly executeAsModal: ReturnType<typeof vi.fn>;
    readonly batchPlay: ReturnType<typeof vi.fn>;
  };
} {
  const disposeLayer = vi.fn();
  const disposeMask = vi.fn();
  const layerImageData = { dispose: disposeLayer };
  const maskImageData = { dispose: disposeMask };
  const getPixels = vi.fn(async () => ({ imageData: layerImageData }));
  const getLayerMask = vi.fn(async () => ({ imageData: maskImageData }));
  const encodeImageData = vi.fn(async ({ imageData }: { readonly imageData: unknown }) =>
    imageData === maskImageData ? 'mask-jpeg-base64' : 'layer-jpeg-base64',
  );
  const getFileForOpening = vi.fn(async () => ({
    name: 'picked.png',
    read: vi.fn(async () => arrayBufferFromText('picked-bytes')),
    write: vi.fn(async () => undefined),
  }));
  const writeTempFile = vi.fn(async () => undefined);
  const createFile = vi.fn(async () => ({
    name: 'temp-image.png',
    read: vi.fn(async () => arrayBufferFromText('unused')),
    write: writeTempFile,
  }));
  const createSessionToken = vi.fn(() => 'session-token-1');
  const batchPlay = vi.fn(async () => undefined);
  const executeAsModal = vi.fn(async (callback: () => Promise<void>) => callback());

  return {
    modules: {
      photoshop: {
        app: {
          activeDocument: {
            id: 42,
            layers: [
              {
                id: 1,
                name: 'Group',
                kind: 'group',
                visible: true,
                layers: [
                  {
                    id: 2,
                    name: 'Child',
                    kind: 'pixel',
                    visible: false,
                    hasUserMask: true,
                    bounds: { _left: 0, _top: 0, _right: 64, _bottom: 64 },
                  },
                  {
                    id: 3,
                    name: 'Empty',
                    kind: 'pixel',
                    visible: true,
                    bounds: { _left: 0, _top: 0, _right: 0, _bottom: 0 },
                  },
                ],
              },
            ],
          },
        },
        imaging: { getPixels, getLayerMask, encodeImageData },
        core: { executeAsModal },
        action: { batchPlay },
      },
      uxp: {
        storage: {
          localFileSystem: {
            formats: { binary: 'binary' },
            getFileForOpening,
            async getTemporaryFolder() {
              return { createFile };
            },
            createSessionToken,
          },
        },
      },
    },
    spies: {
      getPixels,
      getLayerMask,
      encodeImageData,
      disposeLayer,
      disposeMask,
      getFileForOpening,
      createFile,
      writeTempFile,
      createSessionToken,
      executeAsModal,
      batchPlay,
    },
  };
}

describe('PhotoshopHostBridge fake harness', () => {
  it('列出 Photoshop layer tree 并保留 mask/visible 元数据', async () => {
    const { modules } = createFakeModules();
    const bridge = createPhotoshopHostBridge(modules);

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
            hasUserMask: true,
            bounds: { left: 0, top: 0, right: 64, bottom: 64 },
          },
          {
            id: 3,
            name: 'Empty',
            kind: 'pixel',
            visible: true,
            bounds: { left: 0, top: 0, right: 0, bottom: 0 },
          },
        ],
      },
    ]);
  });

  it('通过 imaging 读取 layer 和 mask，并释放 imageData', async () => {
    const { modules, spies } = createFakeModules();
    const bridge = createPhotoshopHostBridge(modules);

    await expect(bridge.readLayerAsAsset(2)).resolves.toEqual({
      type: 'image',
      name: 'layer-2.jpg',
      data: 'layer-jpeg-base64',
      mimeType: 'image/jpeg',
    });
    await expect(bridge.readLayerMaskAsAsset(2)).resolves.toEqual({
      type: 'image',
      name: 'layer-2-mask.jpg',
      data: 'mask-jpeg-base64',
      mimeType: 'image/jpeg',
    });

    expect(spies.getPixels).toHaveBeenCalledWith({
      documentID: 42,
      layerID: 2,
      sourceBounds: { left: 0, top: 0, right: 64, bottom: 64 },
      componentSize: 8,
      applyAlpha: false,
    });
    expect(spies.getLayerMask).toHaveBeenCalledWith({
      documentID: 42,
      layerID: 2,
      kind: 'user',
    });
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Read layer pixels' });
    expect(spies.executeAsModal).toHaveBeenCalledWith(expect.any(Function), { commandName: 'Read layer mask' });
    expect(spies.disposeLayer).toHaveBeenCalledTimes(1);
    expect(spies.disposeMask).toHaveBeenCalledTimes(1);
  });

  it('读取空 bounds 图层前返回清晰错误', async () => {
    const { modules, spies } = createFakeModules();
    const bridge = createPhotoshopHostBridge(modules);

    await expect(bridge.readLayerAsAsset(3)).rejects.toThrow('Photoshop layer has no readable pixels: Empty');

    expect(spies.getPixels).not.toHaveBeenCalled();
    expect(spies.executeAsModal).not.toHaveBeenCalled();
  });

  it('通过 UXP file picker 读取 image file', async () => {
    const { modules, spies } = createFakeModules();
    const bridge = createPhotoshopHostBridge(modules);

    const asset = await bridge.pickImageFile();

    expect(spies.getFileForOpening).toHaveBeenCalledWith({
      types: ['png', 'jpg', 'jpeg', 'webp'],
      allowMultiple: false,
    });
    expect(asset).toMatchObject({
      type: 'image',
      name: 'picked.png',
      mimeType: 'image/png',
    });
    expect(asset?.data).toBeInstanceOf(Uint8Array);
  });

  it('placeAssetOnCanvas 生成 temporary file/session token 并在 modal 内调用 placeEvent', async () => {
    const { modules, spies } = createFakeModules();
    const bridge = createPhotoshopHostBridge(modules);

    await bridge.placeAssetOnCanvas({
      type: 'image',
      name: 'generated.png',
      data: VALID_TRANSPARENT_PNG,
      mimeType: 'image/png',
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
  });

  it('placeAssetOnCanvas 拒绝旧 mock 坏 PNG，避免进入 Photoshop placeEvent', async () => {
    const { modules, spies } = createFakeModules();
    const bridge = createPhotoshopHostBridge(modules);

    await expect(
      bridge.placeAssetOnCanvas({
        type: 'image',
        name: 'legacy-mock.png',
        data: LEGACY_TRUNCATED_MOCK_PNG,
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('PNG asset chunk CRC is invalid.');

    expect(spies.createFile).not.toHaveBeenCalled();
    expect(spies.writeTempFile).not.toHaveBeenCalled();
    expect(spies.createSessionToken).not.toHaveBeenCalled();
    expect(spies.batchPlay).not.toHaveBeenCalled();
  });

  it('依赖缺失时返回不会触碰 Photoshop/UXP 的 stub bridge', async () => {
    const bridge = createPhotoshopHostBridge({});

    await expect(bridge.listLayers()).resolves.toEqual([]);
    await expect(bridge.pickImageFile()).resolves.toBeUndefined();
    await expect(bridge.readLayerMaskAsAsset(1)).resolves.toBeUndefined();
    await expect(bridge.readLayerAsAsset(1)).rejects.toThrow('unavailable outside UXP');
    await expect(bridge.placeAssetOnCanvas({ type: 'image' })).rejects.toThrow('unavailable outside UXP');
  });
});

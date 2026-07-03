import { describe, expect, it } from 'vitest';
import {
  VALID_TRANSPARENT_PNG,
  createBridge,
  createFakeModules,
} from './host-bridge-harness';

describe('PhotoshopHostBridge fake harness — file save', () => {
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

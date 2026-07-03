import { describe, expect, it, vi } from 'vitest';
import {
  createBridge,
  createFakeModules,
  createHostModalRunner,
  providerPolicy,
} from './host-bridge-harness';
import { createNullLogger as foundationNullLogger } from '@imagen-ps/foundation';

describe('PhotoshopHostBridge fake harness — modal & stub fallback', () => {
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
});

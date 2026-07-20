import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@imagen-ps/application';
import { createHostImageAsset } from '../../../src/shared/domain/host-image-asset';
import { MaskCoordinator, type MaskCoordinatorAttachment } from '../../../src/shared/domain/mask-coordinator';

function hostImage(ref: string, placement = true) {
  const asset: Asset = {
    type: 'image',
    name: `${ref}.png`,
    mimeType: 'image/png',
    storedRef: { kind: 'hostObject', ref, mimeType: 'image/png' },
  };
  return createHostImageAsset(asset, {
    source: 'layer',
    payloadKind: 'host-object',
    payloadRef: ref,
    width: 100,
    height: 100,
    ...(placement ? {
      photoshopPlacement: {
        snapshot: {
          documentId: 42,
          documentSize: { width: 1000, height: 1000 },
          layerId: 7,
          layerBoundsNoEffects: { left: 10, top: 20, right: 110, bottom: 120 },
          selectionBounds: null,
        },
        placementRect: { left: 10, top: 20, right: 110, bottom: 120 },
        providerInputPlan: { sourceSize: { width: 100, height: 100 }, targetSize: { width: 100, height: 100 }, kind: 'no-upscale', aspectRatioError: 0 },
      },
    } : {}),
  });
}

function attachment(id: string, image = hostImage(id)): MaskCoordinatorAttachment {
  return { id, image, ...(image.photoshopPlacement ? { photoshopPlacement: image.photoshopPlacement } : {}) };
}

function canonicalMask(ref: string) {
  const image = hostImage(ref);
  return { ...image, canonicalMask: { encoding: 'grayscale' as const, bitDepth: 8 as const, size: { width: 100, height: 100 } } };
}

describe('MaskCoordinator contract', () => {
  it('uses capture selection before user layer mask acquisition', async () => {
    const image = hostImage('primary');
    const mask = hostImage('selection-mask');
    const readLayerMaskAsAsset = vi.fn(async () => canonicalMask('unexpected-mask'));
    const coordinator = new MaskCoordinator({ host: { readLayerMaskAsAsset } });

    await coordinator.reconcile([{
      ...attachment('primary', image),
      selectionMask: { ...mask, canonicalMask: { encoding: 'grayscale', bitDepth: 8, size: { width: 100, height: 100 } } },
    }], { enabled: true });

    expect(coordinator.getState()).toMatchObject({ kind: 'ready', targetAttachmentId: 'primary', editRegion: { source: { kind: 'photoshop-selection' } } });
    expect(readLayerMaskAsAsset).not.toHaveBeenCalled();
  });

  it('releases a selection-owned draft asset on destroy', async () => {
    const image = hostImage('primary');
    const mask = canonicalMask('selection-mask');
    const releaseDraftAsset = vi.fn(async () => undefined);
    const coordinator = new MaskCoordinator({ host: { readLayerMaskAsAsset: vi.fn() }, releaseDraftAsset });

    await coordinator.reconcile([{
      ...attachment('primary', image),
      selectionMask: mask,
    }], { enabled: true });
    await coordinator.destroy();

    expect(releaseDraftAsset).toHaveBeenCalledWith(mask);
  });

  it('does not reacquire when only a non-primary attachment changes', async () => {
    const readLayerMaskAsAsset = vi.fn(async () => canonicalMask('mask'));
    const coordinator = new MaskCoordinator({ host: { readLayerMaskAsAsset } });
    const primary = attachment('primary');

    await coordinator.reconcile([primary, attachment('secondary')], { enabled: true });
    await coordinator.reconcile([primary, attachment('different-secondary')], { enabled: true });

    expect(readLayerMaskAsAsset).toHaveBeenCalledTimes(1);
  });

  it('drops and releases a stale completion after Primary changes', async () => {
    let resolveFirst: ((value: ReturnType<typeof canonicalMask>) => void) | undefined;
    const readLayerMaskAsAsset = vi.fn(() => new Promise<ReturnType<typeof canonicalMask>>((resolve) => { resolveFirst = resolve; }));
    const releaseDraftAsset = vi.fn(async () => undefined);
    const coordinator = new MaskCoordinator({ host: { readLayerMaskAsAsset }, releaseDraftAsset });
    const first = coordinator.reconcile([attachment('first')], { enabled: true });
    await Promise.resolve();
    const second = coordinator.reconcile([attachment('second', hostImage('second', false))], { enabled: true });
    resolveFirst?.(canonicalMask('stale-mask'));
    await Promise.all([first, second]);

    expect(coordinator.getState()).toEqual({ kind: 'none', targetAttachmentId: 'second' });
    expect(releaseDraftAsset).toHaveBeenCalledWith(expect.objectContaining({ asset: expect.objectContaining({ storedRef: expect.objectContaining({ ref: 'stale-mask' }) }) }));
  });
});

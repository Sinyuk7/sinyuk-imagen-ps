import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOTION_DURATION } from '../src/shared/ui/motion';
import { fakeHostImage, fakeOutputAsset, createFakeServices } from './fakes';
import { changeTextarea, clickText, cleanupMainPageRoot, flush, renderMainPage, sendPrompt } from './main-page-harness';

afterEach(async () => {
  await cleanupMainPageRoot();
});

describe('MainPage contract — placement & writeback', () => {
  it('preview writeback 只能经 host.placeAssetOnCanvas 并携带 placement intent', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderMainPage(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'edit captured image');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.img-act')!.click();
    });

    expect(spies.placeAssetOnCanvas).toHaveBeenCalledWith(fakeOutputAsset, expect.objectContaining({
      kind: 'exact-frame',
      documentId: 42,
    }));
  });

  it('Place button exposes placing and placed states without delaying host writeback', async () => {
    vi.useFakeTimers();
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const services = createFakeServices();
      let resolvePlace: (() => void) | undefined;
      services.spies.placeAssetOnCanvas.mockImplementation(() => new Promise<void>((resolve) => {
        resolvePlace = resolve;
      }));
      const { spies } = await renderMainPage(container, services);

      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
      });
      await flush();
      await sendPrompt(container, 'edit captured image');

      const placeButton = container.querySelector<HTMLButtonElement>('[data-testid^="result-place-button-"]')!;
      await act(async () => {
        placeButton.click();
      });
      expect(spies.placeAssetOnCanvas).toHaveBeenCalledTimes(1);
      expect(placeButton.dataset.placeStatus).toBe('placing');
      expect(placeButton.disabled).toBe(true);
      expect(placeButton.closest('.ui-icon-button-host')).toBeNull();

      await act(async () => {
        resolvePlace?.();
        await Promise.resolve();
      });
      expect(placeButton.dataset.placeStatus).toBe('placed');

      await act(async () => {
        vi.advanceTimersByTime(MOTION_DURATION.statusReset);
      });
      expect(placeButton.dataset.placeStatus).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('unbound text-to-image result places into Active Document with click-time tooltip', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);

    await sendPrompt(container, 'make unbound image');

    const placeButton = container.querySelector<HTMLButtonElement>('[data-testid^="result-place-button-"]')!;
    expect(placeButton.textContent).toContain('置入 Active Document');
    expect(placeButton.title).toContain('当前活动的 Photoshop 文档');
  });

  it('multiple-document placement conflict disables Place without choosing active document', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.captureActiveImage
      .mockResolvedValueOnce({
        image: fakeHostImage,
        sourceKind: 'layer' as const,
        placement: {
          snapshot: {
            documentId: 1,
            documentSize: { width: 1024, height: 768 },
            layerId: 1,
            layerBoundsNoEffects: { left: 0, top: 0, right: 128, bottom: 128 },
            selectionBounds: null,
          },
          placementRect: { left: 0, top: 0, right: 128, bottom: 128 },
        },
      })
      .mockResolvedValueOnce({
        image: fakeHostImage,
        sourceKind: 'layer' as const,
        placement: {
          snapshot: {
            documentId: 2,
            documentSize: { width: 1024, height: 768 },
            layerId: 1,
            layerBoundsNoEffects: { left: 0, top: 0, right: 128, bottom: 128 },
            selectionBounds: null,
          },
          placementRect: { left: 0, top: 0, right: 128, bottom: 128 },
        },
      });
    const { spies } = await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'edit multiple docs');
    });
    await flush();

    const send = container.querySelector<HTMLButtonElement>('[data-testid="composer-send-button"]')!;
    expect(send.disabled).toBe(true);
    expect(container.querySelector('[data-testid="composer-readiness-status"]')?.textContent).toContain('请先解决置入冲突');
    await act(async () => {
      send.click();
    });
    expect(spies.submitJob).not.toHaveBeenCalled();
    expect(spies.placeAssetOnCanvas).not.toHaveBeenCalled();
  });

  it('layer attachment writeback targets the source Photoshop document', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderMainPage(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从 PS 图层选择');
    });
    await act(async () => {
      clickText(container, '.layer-item', 'Layer 1');
    });
    await flush();
    await sendPrompt(container, 'edit layer image');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.img-act')!.click();
    });

    expect(spies.placeAssetOnCanvas).toHaveBeenCalledWith(fakeOutputAsset, expect.objectContaining({
      kind: 'exact-frame',
      documentId: 42,
    }));
  });
});

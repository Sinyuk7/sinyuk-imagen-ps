import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createHostImageAsset } from '../../../src/shared/domain/host-image-asset';
import { useComposerDraft, type ComposerDraftController } from '../../../src/shared/ui/hooks/use-composer-draft';

function createImage() {
  return createHostImageAsset({
    type: 'image',
    name: 'capture.png',
    mimeType: 'image/png',
    storedRef: {
      kind: 'hostObject',
      ref: 'capture-ref',
      name: 'capture.png',
      mimeType: 'image/png',
    },
  }, {
    source: 'layer',
    payloadKind: 'host-object',
    payloadRef: 'capture-ref',
    width: 64,
    height: 64,
  });
}

async function renderDraftProbe(): Promise<{
  readonly draft: () => ComposerDraftController;
  readonly unmount: () => Promise<void>;
}> {
  let root: Root | undefined;
  let current: ComposerDraftController | undefined;
  const container = document.createElement('div');

  function Probe() {
    current = useComposerDraft();
    return null;
  }

  root = createRoot(container);
  await act(async () => {
    root!.render(<Probe />);
  });

  return {
    draft: () => {
      if (!current) {
        throw new Error('Draft probe did not render.');
      }
      return current;
    },
    async unmount() {
      await act(async () => {
        root?.unmount();
      });
    },
  };
}

describe('useComposerDraft preview state', () => {
  it('updates matching attachment previews and releases replaced preview handles', async () => {
    const probe = await renderDraftProbe();
    const replacedDispose = vi.fn();
    const nextDispose = vi.fn();
    try {
      await act(async () => {
        probe.draft().addAttachment({
          id: 'capture-1',
          type: 'photoshop-capture',
          name: 'Capture',
          image: createImage(),
          previewUrl: 'blob:old',
          previewGeneration: 7,
          previewDispose: replacedDispose,
        });
      });

      await act(async () => {
        probe.draft().updateAttachmentPreview('capture-1', 7, {
          url: 'blob:new',
          dispose: nextDispose,
        });
      });

      expect(probe.draft().attachments[0]).toMatchObject({
        id: 'capture-1',
        previewUrl: 'blob:new',
        previewGeneration: 7,
      });
      expect(replacedDispose).toHaveBeenCalledTimes(1);
      expect(nextDispose).not.toHaveBeenCalled();
    } finally {
      await probe.unmount();
    }
    expect(nextDispose).toHaveBeenCalledTimes(1);
  });

  it('discards stale or removed attachment preview results', async () => {
    const probe = await renderDraftProbe();
    const staleDispose = vi.fn();
    const removedDispose = vi.fn();
    try {
      await act(async () => {
        probe.draft().addAttachment({
          id: 'capture-1',
          type: 'photoshop-capture',
          name: 'Capture',
          image: createImage(),
          previewUrl: '',
          previewGeneration: 2,
        });
      });

      await act(async () => {
        probe.draft().updateAttachmentPreview('capture-1', 1, {
          url: 'blob:stale',
          dispose: staleDispose,
        });
      });

      expect(probe.draft().attachments[0]?.previewUrl).toBe('');
      expect(staleDispose).toHaveBeenCalledTimes(1);

      await act(async () => {
        probe.draft().removeAttachment('capture-1');
      });
      await act(async () => {
        probe.draft().updateAttachmentPreview('capture-1', 2, {
          url: 'blob:removed',
          dispose: removedDispose,
        });
      });

      expect(probe.draft().attachments).toHaveLength(0);
      expect(removedDispose).toHaveBeenCalledTimes(1);
    } finally {
      await probe.unmount();
    }
  });
});

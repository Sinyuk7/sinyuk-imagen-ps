import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostImageAsset } from '../../../../src/shared/domain/host-image-asset';
import { createMemoryThumbnailStore } from '../../../../src/shared/image/thumbnail-store';
import { cleanupMainPageRoot, flush, renderMainPage, sendPrompt } from '../../../helpers/main-page-harness';
import { createFakeServices } from '../../../helpers/fakes';
import {
  fakeOutputAsset,
  fakeOutputBytes,
  fakeProviderInputAsset,
} from '../../../helpers/fixtures/assets.fixtures';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function click(element: Element | null): Promise<void> {
  expect(element).not.toBeNull();
  await act(async () => {
    (element as HTMLElement).click();
  });
}

describe('MainPage preview fallback', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('renders shared thumbnail fallback for picked images without a preview URL', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });
    fake.spies.pickImageFile.mockResolvedValueOnce(createHostImageAsset(fakeProviderInputAsset, {
      source: 'file',
      payloadKind: 'host-object',
      payloadRef: fakeProviderInputAsset.storedRef?.ref,
    }));

    await renderMainPage(container, fake);
    await click(container.querySelector('[data-testid="composer-add-image-button"]'));
    await flush();
    await click(container.querySelector('[data-testid="attach-upload-option"]'));
    await flush();

    const fallback = container.querySelector('.att-thumb .image-fallback[data-state="preview-unavailable"]');
    expect(fallback).not.toBeNull();
  });

  it('keeps result preview frame in loading fallback while thumbnail work is pending', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });
    const thumbnailBytes = deferred<ArrayBuffer>();
    fake.services.thumbnails = createMemoryThumbnailStore({
      async resolveStoredRef(ref) {
        if (ref.ref === fakeOutputAsset.storedRef?.ref) {
          return thumbnailBytes.promise;
        }
        return fakeOutputBytes.buffer.slice(0);
      },
    });

    await renderMainPage(container, fake);
    await sendPrompt(container, 'Generate image with delayed preview.');
    await flush();
    await flush();

    const loading = container.querySelector('[data-testid^="result-preview-"] .image-fallback[data-state="loading"]');
    expect(loading).not.toBeNull();

    thumbnailBytes.resolve(fakeOutputBytes.buffer.slice(0));
    await flush();
    await flush();

    expect(container.querySelector('[data-testid^="result-preview-"] .img-media')).not.toBeNull();
  });

  it('shows preview-unavailable fallback when result thumbnail bytes are invalid', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });
    fake.services.thumbnails = createMemoryThumbnailStore({
      async resolveStoredRef() {
        return new Uint8Array([1, 2, 3]).buffer;
      },
    });

    await renderMainPage(container, fake);
    await sendPrompt(container, 'Generate image with broken preview bytes.');
    await flush();
    await flush();

    const fallback = container.querySelector('[data-testid^="result-preview-"] .image-fallback[data-state="preview-unavailable"]');
    expect(fallback?.textContent ?? '').toContain('暂无预览');
  });
});

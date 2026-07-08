import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageFallbackContent } from '../../../../src/shared/ui/components/image-fallback-content';

let root: Root | undefined;

async function cleanupRoot(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  document.body.innerHTML = '';
}

describe('ImageFallbackContent', () => {
  afterEach(async () => {
    await cleanupRoot();
  });

  it('keeps glyph shapes explicit for UXP fill rendering', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <ImageFallbackContent
          density="thumbnail"
          state="preview-unavailable"
          title="Preview unavailable"
        />,
      );
    });

    const rect = container.querySelector('rect');
    const path = container.querySelector('path');
    const circle = container.querySelector('circle');

    expect(rect?.getAttribute('fill')).toBe('none');
    expect(rect?.getAttribute('stroke')).toBe('currentColor');
    expect(path?.getAttribute('fill')).toBe('none');
    expect(path?.getAttribute('stroke')).toBe('currentColor');
    expect(circle?.getAttribute('fill')).toBe('currentColor');
    expect(circle?.getAttribute('stroke')).toBe('none');
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { IconGalleryPage } from '../../../src/harness/components/icon-gallery';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Icon gallery harness', () => {
  it('renders all icon names at 16/18/20 sizes', async () => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '800px';
    document.body.appendChild(container);

    root = createRoot(container);
    await act(async () => {
      root!.render(<IconGalleryPage />);
    });
    await flush();

    const svgs = container.querySelectorAll('svg[data-icon-name]');
    expect(svgs.length).toBeGreaterThan(0);

    const iconNames = new Set<string>();
    svgs.forEach((svg) => {
      const name = svg.getAttribute('data-icon-name');
      if (name) iconNames.add(name);
    });

    expect(iconNames.has('refresh')).toBe(true);
    expect(iconNames.has('settings')).toBe(true);
    expect(iconNames.has('spinner')).toBe(true);
    expect(iconNames.has('network')).toBe(true);
    expect(iconNames.has('add')).toBe(true);
    expect(iconNames.has('close')).toBe(true);
    expect(iconNames.has('check')).toBe(true);

    const gallery = container.querySelector('.icon-gallery-root');
    expect(gallery).not.toBeNull();

    container.remove();
  });

  it('renders disabled and selected variants', async () => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '800px';
    document.body.appendChild(container);

    root = createRoot(container);
    await act(async () => {
      root!.render(<IconGalleryPage />);
    });
    await flush();

    const disabledCells = container.querySelectorAll('[data-icon-disabled]');
    expect(disabledCells.length).toBeGreaterThan(0);

    const selectedCells = container.querySelectorAll('[data-icon-selected]');
    expect(selectedCells.length).toBeGreaterThan(0);

    container.remove();
  });

  it('every icon renders with non-zero dimensions', async () => {
    const container = document.createElement('div');
    container.style.width = '600px';
    container.style.height = '800px';
    document.body.appendChild(container);

    root = createRoot(container);
    await act(async () => {
      root!.render(<IconGalleryPage />);
    });
    await flush();

    const svgs = container.querySelectorAll<SVGSVGElement>('svg[data-icon-name]');
    svgs.forEach((svg) => {
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      expect(Number(w)).toBeGreaterThan(0);
      expect(Number(h)).toBeGreaterThan(0);
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    });

    container.remove();
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../src/shared/ui/app-shell';
import { createFakeServices } from './fakes';

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

interface LayoutRects {
  readonly rootWidth: number;
  readonly rootHeight: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly panelHasFixedWidth: boolean;
  readonly panelHasFixedHeight: boolean;
  readonly scrollOverflowY: string;
  readonly scrollMinHeight: string;
  readonly pageHasHorizontalScroll: boolean;
}

function measureLayout(container: HTMLElement): LayoutRects {
  const root = container;
  const panel = root.querySelector('.panel') as HTMLElement | null;
  if (!panel) {
    throw new Error('Panel element not found.');
  }
  const panelStyle = window.getComputedStyle(panel);
  const scroll = root.querySelector('.scroll') as HTMLElement | null;
  const scrollStyle = scroll ? window.getComputedStyle(scroll) : { overflowY: '', minHeight: '' };

  return {
    rootWidth: root.clientWidth,
    rootHeight: root.clientHeight,
    panelWidth: panel.clientWidth,
    panelHeight: panel.clientHeight,
    panelHasFixedWidth: panelStyle.width.includes('px') && !panelStyle.width.includes('%'),
    panelHasFixedHeight: panelStyle.height.includes('px') && !panelStyle.height.includes('%'),
    scrollOverflowY: scrollStyle.overflowY,
    scrollMinHeight: scrollStyle.minHeight,
    pageHasHorizontalScroll: panel.scrollWidth > panel.clientWidth,
  };
}

async function renderApp(container: HTMLElement, width = 380, height = 640): Promise<void> {
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.display = 'block';
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AppShell
        host={{
          kind: 'photoshop-uxp',
          app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
          locale: 'zh-CN',
          services: createFakeServices().services,
          dispose: () => undefined,
        }}
      />,
    );
  });
  await flush();
  await flush();
}

describe('Panel responsive layout contract', () => {
  it('panel fills root container without fixed px width or height', async () => {
    const container = document.createElement('div');
    await renderApp(container, 380, 640);
    const layout = measureLayout(container);

    expect(layout.panelHasFixedWidth).toBe(false);
    expect(layout.panelHasFixedHeight).toBe(false);
    expect(Math.abs(layout.panelWidth - layout.rootWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.panelHeight - layout.rootHeight)).toBeLessThanOrEqual(1);
  });

  it('panel adapts to a smaller container', async () => {
    const container = document.createElement('div');
    await renderApp(container, 300, 480);
    const layout = measureLayout(container);

    expect(layout.panelWidth).toBe(layout.rootWidth);
    expect(layout.panelHeight).toBe(layout.rootHeight);
    expect(layout.pageHasHorizontalScroll).toBe(false);
  });

  it('panel adapts to a larger container', async () => {
    const container = document.createElement('div');
    await renderApp(container, 600, 800);
    const layout = measureLayout(container);

    expect(layout.panelWidth).toBe(layout.rootWidth);
    expect(layout.panelHeight).toBe(layout.rootHeight);
    expect(layout.pageHasHorizontalScroll).toBe(false);
  });

  it('primary scroll container has overflow-y auto and min-height 0', async () => {
    const container = document.createElement('div');
    await renderApp(container, 380, 640);
    const layout = measureLayout(container);

    expect(layout.scrollOverflowY === 'auto' || layout.scrollOverflowY === 'scroll').toBe(true);
    expect(layout.scrollMinHeight === '0' || layout.scrollMinHeight === '0px').toBe(true);
  });

  it('no page-level horizontal scroll at narrow width', async () => {
    const container = document.createElement('div');
    await renderApp(container, 280, 420);
    const layout = measureLayout(container);

    expect(layout.pageHasHorizontalScroll).toBe(false);
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UxpCssContractHarnessPage } from '../src/harness/components/uxp-css-contract';

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

describe('UXP CSS contract harness', () => {
  it('renders inside a real panel shell with a single primary scroll container', async () => {
    const container = document.createElement('div');
    container.style.width = '300px';
    container.style.height = '420px';
    document.body.appendChild(container);

    root = createRoot(container);
    await act(async () => {
      root!.render(<UxpCssContractHarnessPage />);
    });
    await flush();
    await flush();

    const panel = container.querySelector<HTMLElement>('[data-testid="uxp-css-contract-panel"]');
    const scroll = container.querySelector<HTMLElement>('[data-testid="uxp-css-contract-scroll"]');
    expect(panel).not.toBeNull();
    expect(scroll).not.toBeNull();

    const scrollStyle = window.getComputedStyle(scroll!);
    expect(scrollStyle.overflowY === 'auto' || scrollStyle.overflowY === 'scroll').toBe(true);
    expect(scrollStyle.minHeight === '0px' || scrollStyle.minHeight === '0').toBe(true);
  });

  it('updates panel width and height modes from ResizeObserver geometry', async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    let resizeCallback: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    globalThis.ResizeObserver = class ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe = observe;
      disconnect = disconnect;
    } as typeof ResizeObserver;

    try {
      const container = document.createElement('div');
      container.style.width = '360px';
      container.style.height = '600px';
      document.body.appendChild(container);

      root = createRoot(container);
      await act(async () => {
        root!.render(<UxpCssContractHarnessPage />);
      });
      await flush();
      await flush();

      const panel = container.querySelector<HTMLElement>('[data-testid="uxp-css-contract-panel"]');
      expect(panel).not.toBeNull();
      expect(observe).toHaveBeenCalledWith(panel);

      resizeCallback?.(
        [{
          target: panel!,
          contentRect: { width: 300, height: 420 } as DOMRectReadOnly,
        } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      expect(panel?.getAttribute('data-panel-width-mode')).toBe('compact');
      expect(panel?.getAttribute('data-panel-height-mode')).toBe('short');

      resizeCallback?.(
        [{
          target: panel!,
          contentRect: { width: 600, height: 800 } as DOMRectReadOnly,
        } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      expect(panel?.getAttribute('data-panel-width-mode')).toBe('wide');
      expect(panel?.getAttribute('data-panel-height-mode')).toBe('normal');
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });
});

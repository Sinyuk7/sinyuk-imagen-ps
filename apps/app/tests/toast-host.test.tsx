import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToast } from '../src/shared/ui/components/toast-host';
import { TestToastSurface } from './render-helpers';

let root: Root | undefined;
let originalRequestAnimationFrame: typeof globalThis.requestAnimationFrame | undefined;
let originalCancelAnimationFrame: typeof globalThis.cancelAnimationFrame | undefined;

function ToastHarness({ onRetry }: { readonly onRetry: () => void }) {
  const toast = useToast();
  return (
    <div className="page">
      <button data-testid="show-dedupe-a" onClick={() => toast.show('First sync', 'info', { key: 'dedupe' })}>show dedupe a</button>
      <button data-testid="show-dedupe-b" onClick={() => toast.show('Second sync', 'info', { key: 'dedupe' })}>show dedupe b</button>
      <button data-testid="show-positive" onClick={() => toast.show('Provider saved', 'positive', { key: 'positive' })}>show positive</button>
      <button data-testid="show-negative" onClick={() => toast.show('Could not connect', 'negative', { key: 'negative' })}>show negative</button>
      <button data-testid="show-blocking" onClick={() => toast.show('Blocking failure', 'negative', { key: 'blocking', durationMs: null })}>show blocking</button>
      <button data-testid="queue-neutral" onClick={() => toast.show('Queued neutral', 'neutral', { key: 'queued-neutral', durationMs: null, dismissible: true })}>queue neutral</button>
      <button data-testid="queue-positive" onClick={() => toast.show('Queued positive', 'positive', { key: 'queued-positive', durationMs: null, dismissible: true })}>queue positive</button>
      <button data-testid="queue-info" onClick={() => toast.show('Queued info', 'info', { key: 'queued-info', durationMs: null, dismissible: true })}>queue info</button>
      <button data-testid="show-hover" onClick={() => toast.show('Hover me', 'info', { key: 'hover', durationMs: 900, dismissible: true })}>show hover</button>
      <button
        data-testid="show-action"
        onClick={() => toast.show('Could not connect', 'negative', {
          key: 'retry-toast',
          durationMs: null,
          action: {
            label: 'Retry',
            onAction: onRetry,
          },
        })}
      >
        show action
      </button>
    </div>
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16)) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof cancelAnimationFrame;
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  vi.useRealTimers();
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

describe('ToastHost', () => {
  async function renderHarness(onRetry = vi.fn()): Promise<{ readonly container: HTMLDivElement; readonly onRetry: ReturnType<typeof vi.fn> }> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TestToastSurface locale="en">
          <ToastHarness onRetry={onRetry} />
        </TestToastSurface>,
      );
    });
    await flush();
    return { container, onRetry };
  }

  it('dedupes repeated toast keys and resets the visible content', async () => {
    const { container } = await renderHarness();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="show-dedupe-a"]')!.click();
      container.querySelector<HTMLElement>('[data-testid="show-dedupe-b"]')!.click();
    });
    await flush();

    expect(container.querySelectorAll('[data-testid="toast"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Second sync');
    await advance(3000);
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Second sync');
    await advance(400);
    expect(container.querySelector('[data-testid="toast"]')).toBeNull();
  });

  it('keeps non-urgent negative toasts polite and lets them replace lower-priority current toasts', async () => {
    const { container } = await renderHarness();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="show-positive"]')!.click();
      container.querySelector<HTMLElement>('[data-testid="show-negative"]')!.click();
    });
    await flush();

    const toast = container.querySelector<HTMLElement>('[data-testid="toast"]');
    expect(toast?.textContent).toContain('Could not connect');
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('aria-live')).toBe('polite');
    expect(container.querySelector('[aria-label="Dismiss"]')).not.toBeNull();
  });

  it('keeps only two queued toasts and drains them by priority', async () => {
    const { container } = await renderHarness();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="show-blocking"]')!.click();
      container.querySelector<HTMLElement>('[data-testid="queue-neutral"]')!.click();
      container.querySelector<HTMLElement>('[data-testid="queue-positive"]')!.click();
      container.querySelector<HTMLElement>('[data-testid="queue-info"]')!.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Blocking failure');
    await act(async () => {
      container.querySelector<HTMLElement>('[aria-label="Dismiss"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Queued info');

    await act(async () => {
      container.querySelector<HTMLElement>('[aria-label="Dismiss"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Queued positive');
    await act(async () => {
      container.querySelector<HTMLElement>('[aria-label="Dismiss"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="toast"]')).toBeNull();
  });

  it('pauses timeout on hover and resumes from the remaining duration', async () => {
    const { container } = await renderHarness();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="show-hover"]')!.click();
    });
    await flush();
    await advance(500);

    const toast = container.querySelector<HTMLElement>('[data-testid="toast"]');
    toast?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await advance(1000);
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Hover me');

    container.querySelector<HTMLElement>('[data-testid="toast"]')?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await advance(300);
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Hover me');
    await advance(250);
    expect(container.querySelector('[data-testid="toast"]')).toBeNull();
  });

  it('renders a single optional action button and fires it', async () => {
    const retrySpy = vi.fn();
    const { container } = await renderHarness(retrySpy);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="show-action"]')!.click();
    });
    await flush();

    expect(container.querySelector('[aria-label="Dismiss"]')).not.toBeNull();

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Retry')!.click();
    });

    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  it('shrinks long toast text through discrete size steps and keeps the full message in title when truncated', async () => {
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        if (this instanceof HTMLElement && this.classList.contains('ui-toast-message')) {
          return 84;
        }
        return clientWidthDescriptor?.get ? clientWidthDescriptor.get.call(this) : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        if (this instanceof HTMLElement && this.classList.contains('ui-toast-message')) {
          const size = this.closest<HTMLElement>('[data-testid="toast"]')?.dataset.textSize;
          if (size === 'sm') return 104;
          if (size === 'xs') return 92;
          return 128;
        }
        return scrollWidthDescriptor?.get ? scrollWidthDescriptor.get.call(this) : 0;
      },
    });

    try {
      const { container } = await renderHarness();

      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="show-dedupe-a"]')!.click();
      });
      await flush();

      const toast = container.querySelector<HTMLElement>('[data-testid="toast"]');
      const message = container.querySelector<HTMLElement>('.ui-toast-message');
      expect(toast?.dataset.textSize).toBe('xs');
      expect(message?.getAttribute('title')).toBe('First sync');
    } finally {
      if (clientWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
      }
      if (scrollWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidthDescriptor);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollWidth;
      }
    }
  });
});

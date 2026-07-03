import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '../src/shared/ui/app-error-boundary';

function Crasher() {
  throw new Error('render crashed');
}

describe('AppErrorBoundary', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
  });

  it('renders a fallback alert instead of white-screening the app tree', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    act(() => {
      root!.render(
        <AppErrorBoundary runtime="chrome">
          <Crasher />
        </AppErrorBoundary>,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('render crashed');
    expect(container.querySelector('[role="alert"]')?.getAttribute('data-status')).toBe('error');
    consoleErrorSpy.mockRestore();
  });
});

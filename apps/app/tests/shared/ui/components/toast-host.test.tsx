import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToast } from '../../../../src/shared/ui/components/toast-host';
import { TestToastSurface } from '../../../helpers/render-helpers';

let root: Root | undefined;

function ToastHarness() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.show('Current info', 'info', { key: 'current', durationMs: 300 })}>current</button>
      <button onClick={() => toast.show('Queued positive', 'positive', { key: 'queued', durationMs: 400 })}>queued</button>
      <button onClick={() => toast.show('Invalid duration', 'positive', { key: 'invalid', durationMs: Number.NaN })}>invalid</button>
    </>
  );
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
  }
  root = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('ToastHost timing', () => {
  async function renderHarness(): Promise<HTMLDivElement> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TestToastSurface locale="en">
          <ToastHarness />
        </TestToastSurface>,
      );
    });
    return container;
  }

  it('arms the promoted queued toast with its own duration', async () => {
    const container = await renderHarness();
    const buttons = container.querySelectorAll('button');

    await act(async () => {
      buttons[0]!.click();
      buttons[1]!.click();
    });
    await advance(300);
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('Queued positive');

    await advance(550);
    expect(container.querySelector('[data-testid="toast"]')).toBeNull();
  });

  it('falls back from an invalid duration and remains manually closable', async () => {
    const container = await renderHarness();

    await act(async () => {
      container.querySelectorAll('button')[2]!.click();
    });
    expect(container.querySelector('[aria-label="Dismiss"]')).not.toBeNull();

    await advance(650);
    expect(container.querySelector('[data-testid="toast"]')).toBeNull();
  });
});

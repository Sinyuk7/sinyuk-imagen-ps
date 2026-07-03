import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UxpTextArea } from '../src/shared/ui/components/uxp-form-controls';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  vi.useRealTimers();
});

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
}

async function advanceTimersByTime(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('UXP textarea seam', () => {
  it('syncs textarea before submit key handling', async () => {
    const onValue = vi.fn();
    const onKeyDown = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<UxpTextArea value="" onValue={onValue} onKeyDown={onKeyDown} />);
    });

    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      setTextAreaValue(textarea, 'prompt');
      textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(onValue).toHaveBeenCalledWith('prompt');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('falls back to clipboard text when Cmd+V does not update the native textarea', async () => {
    vi.useFakeTimers();
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn(async () => ({ 'text/plain': ' pasted' })),
      },
    });
    const onValue = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    try {
      await act(async () => {
        root!.render(<UxpTextArea value="hello" onValue={onValue} />);
      });

      const textarea = container.querySelector('textarea')!;
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;
      await act(async () => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'v', metaKey: true }));
      });
      await advanceTimersByTime(300);

      expect(textarea.value).toBe('hello pasted');
      expect(onValue).toHaveBeenLastCalledWith('hello pasted');
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  it('falls back to paste event clipboard data for long text', async () => {
    vi.useFakeTimers();
    const onValue = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const longText = Array.from({ length: 80 }, (_, index) => `line ${index}`).join('\n');

    await act(async () => {
      root!.render(<UxpTextArea value="hello" onValue={onValue} />);
    });

    const textarea = container.querySelector('textarea')!;
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? longText : ''),
      },
    });
    await act(async () => {
      textarea.dispatchEvent(pasteEvent);
    });
    await advanceTimersByTime(300);

    expect(textarea.value).toBe(`hello${longText}`);
    expect(onValue).toHaveBeenLastCalledWith(`hello${longText}`);
  });

  it('does not duplicate paste when the native textarea updates before fallback', async () => {
    vi.useFakeTimers();
    const readText = vi.fn(async () => ' pasted');
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText },
    });
    const onValue = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    try {
      await act(async () => {
        root!.render(<UxpTextArea value="hello" onValue={onValue} />);
      });

      const textarea = container.querySelector('textarea')!;
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;
      await act(async () => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'v', metaKey: true }));
      });
      await advanceTimersByTime(0);
      setTextAreaValue(textarea, 'hello native');
      await advanceTimersByTime(300);

      expect(readText).not.toHaveBeenCalled();
      expect(textarea.value).toBe('hello native');
      expect(onValue).toHaveBeenLastCalledWith('hello native');
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }
  });
});

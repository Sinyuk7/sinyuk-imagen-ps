import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UxpFlightRecorder } from '../../../../src/host/uxp-log-sink';
import { UxpTextArea, type UxpTextAreaElement } from '../../../../src/shared/ui/components/uxp-form-controls';
import { flush } from '../../../helpers/settings-detail-harness';

let root: Root | undefined;
let records: Array<{ readonly event: string; readonly attrs?: Record<string, unknown> }> = [];

const LONG_PROMPT = 'editorial fashion photo of a woman sitting in a mustard-yellow velvet armchair, wearing an oversized mustard-yellow power suit over a deep purple wrap top, purple-tinted aviator sunglasses, holding a matte black coffee mug, open laptop resting on her lap, long tousled brown hair, soft studio light, muted sage-green backdrop, confident luxe mood, half-body shot, shallow depth of field, ';
const DELETE_SYNC_CHECK_DELAY_MS = 120;

function Probe() {
  const [value, setValue] = useState(LONG_PROMPT);
  return (
    <>
      <UxpTextArea
        data-testid="text-area-probe"
        id="text-area-probe"
        className="cmp-ta"
        rows={2}
        value={value}
        onValue={setValue}
      />
      <div data-testid="text-area-probe-value">{value}</div>
    </>
  );
}

function changeTextareaByInput(textarea: UxpTextAreaElement, value: string, inputType: string): void {
  textarea.value = value;
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: null }));
}

async function cleanupRoot(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  document.body.innerHTML = '';
}

describe('TextArea seam', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    records = [];
    const recorder: UxpFlightRecorder = {
      async checkpoint(event, attrs) {
        records.push({ event, attrs });
      },
      async fail() {
        return undefined;
      },
    };
    globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__ = recorder;
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__;
    await cleanupRoot();
  });

  it('syncs delete updates from input events without waiting for keyup', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<Probe />);
    });
    await flush();

    const textarea = container.querySelector<UxpTextAreaElement>('[data-testid="text-area-probe"]');
    const mirror = container.querySelector<HTMLElement>('[data-testid="text-area-probe-value"]');
    expect(textarea).not.toBeNull();
    expect(mirror?.textContent).toBe(LONG_PROMPT);

    const nextValue = LONG_PROMPT.slice(0, -1);
    await act(async () => {
      changeTextareaByInput(textarea!, nextValue, 'deleteContentBackward');
      vi.advanceTimersByTime(DELETE_SYNC_CHECK_DELAY_MS + 1);
    });
    await flush();

    expect(textarea?.value).toBe(nextValue);
    expect(mirror?.textContent).toBe(nextValue);
    expect(records).toEqual([]);
  });

  it('applies delete fallback only when native delete never changes the textarea', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<Probe />);
    });
    await flush();

    const textarea = container.querySelector<UxpTextAreaElement>('[data-testid="text-area-probe"]');
    const mirror = container.querySelector<HTMLElement>('[data-testid="text-area-probe-value"]');
    expect(textarea).not.toBeNull();
    textarea!.focus();
    textarea!.selectionStart = LONG_PROMPT.length;
    textarea!.selectionEnd = LONG_PROMPT.length;

    const nextValue = LONG_PROMPT.slice(0, -1);
    await act(async () => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }));
      vi.advanceTimersByTime(DELETE_SYNC_CHECK_DELAY_MS + 1);
    });
    await flush();

    expect(textarea?.value).toBe(nextValue);
    expect(mirror?.textContent).toBe(nextValue);
    expect(records.some((record) => record.event === 'uxp.ui.textarea.delete.no_native_change')).toBe(false);
    expect(records.some((record) => record.event === 'uxp.ui.textarea.delete.native_fallback_applied')).toBe(true);
  });

  it('syncs Chinese IME commits and cut events through the Spectrum textarea', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<Probe />);
    });
    await flush();

    const textarea = container.querySelector<UxpTextAreaElement>('[data-testid="text-area-probe"]')!;
    const mirror = container.querySelector<HTMLElement>('[data-testid="text-area-probe-value"]');
    await act(async () => {
      textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      changeTextareaByInput(textarea, `${LONG_PROMPT}中文输入`, 'insertCompositionText');
      textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文输入' }));
    });
    await flush();
    expect(mirror?.textContent).toBe(`${LONG_PROMPT}中文输入`);

    await act(async () => {
      textarea.value = LONG_PROMPT;
      textarea.dispatchEvent(new Event('cut', { bubbles: true }));
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(mirror?.textContent).toBe(LONG_PROMPT);
  });

  it('preserves selection for paste fallback and Delete fallback', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => '中文' },
    });

    try {
      await act(async () => {
        root!.render(<Probe />);
      });
      await flush();

      const textarea = container.querySelector<UxpTextAreaElement>('[data-testid="text-area-probe"]')!;
      const mirror = container.querySelector<HTMLElement>('[data-testid="text-area-probe-value"]');
      textarea.focus();
      textarea.value = 'abCD';
      textarea.selectionStart = 2;
      textarea.selectionEnd = 4;
      await act(async () => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'v', metaKey: true }));
        await vi.advanceTimersByTimeAsync(301);
      });
      await flush();
      expect(textarea.value).toBe('ab中文');
      expect(textarea.selectionStart).toBe(4);
      expect(textarea.selectionEnd).toBe(4);
      expect(mirror?.textContent).toBe('ab中文');

      textarea.value = '甲乙丙';
      textarea.selectionStart = 1;
      textarea.selectionEnd = 2;
      await act(async () => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
        vi.advanceTimersByTime(DELETE_SYNC_CHECK_DELAY_MS + 1);
      });
      await flush();
      expect(textarea.value).toBe('甲丙');
      expect(mirror?.textContent).toBe('甲丙');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
    }
  });
});

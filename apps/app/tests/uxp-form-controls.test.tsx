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
});

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
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
});

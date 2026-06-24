import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UxpCheckbox, UxpTextArea, UxpTextField } from '../src/shared/ui/components/uxp-form-controls';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
}

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
}

describe('UXP-safe form controls', () => {
  it('syncs text fields on keyboard and blur user paths', async () => {
    const onValue = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<UxpTextField value="" onValue={onValue} />);
    });

    const input = container.querySelector('input')!;
    await act(async () => {
      setInputValue(input, 'typed');
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'd' }));
    });
    await act(async () => {
      setInputValue(input, 'blurred');
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(onValue).toHaveBeenNthCalledWith(1, 'typed');
    expect(onValue).toHaveBeenNthCalledWith(2, 'blurred');
  });

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

  it('syncs checkbox through click without exposing page-level change handlers', async () => {
    const onChecked = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<UxpCheckbox checked={false} onChecked={onChecked} />);
    });

    const checkbox = container.querySelector('input')!;
    await act(async () => {
      checkbox.click();
    });

    expect(onChecked).toHaveBeenCalledWith(true);
  });
});

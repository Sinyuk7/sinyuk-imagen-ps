import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox, TextField } from '../src/shared/ui/primitives/native-controls';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

describe('Shared native control seam', () => {
  it('syncs input values on keyboard and blur paths', async () => {
    const onValue = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<TextField value="" onValue={onValue} />);
    });

    const input = container.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();

    await act(async () => {
      input!.value = 'typed';
      input!.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'd' }));
    });
    await act(async () => {
      input!.value = 'blurred';
      input!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(onValue).toHaveBeenNthCalledWith(1, 'typed');
    expect(onValue).toHaveBeenNthCalledWith(2, 'blurred');
  });

  it('syncs checkbox values through the shared checked contract', async () => {
    const onChecked = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<Checkbox checked={false} onChecked={onChecked}>Enabled</Checkbox>);
    });

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox!.click();
    });

    expect(onChecked).toHaveBeenCalledWith(true);
  });
});

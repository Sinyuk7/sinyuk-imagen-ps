import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox, TextField } from '../src/shared/ui/primitives/spectrum-controls';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

type SpectrumTextfieldElement = HTMLElement & { value?: string };
type SpectrumCheckboxElement = HTMLElement & { checked?: boolean };

describe('Shared spectrum control seam', () => {
  it('syncs sp-textfield values on keyboard and blur paths', async () => {
    const onValue = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<TextField value="" onValue={onValue} />);
    });

    const input = container.querySelector<SpectrumTextfieldElement>('sp-textfield');
    expect(input).not.toBeNull();

    await act(async () => {
      input!.value = 'typed';
      input!.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'd' }));
    });
    await act(async () => {
      input!.value = 'blurred';
      input!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });

    expect(onValue).toHaveBeenNthCalledWith(1, 'typed');
    expect(onValue).toHaveBeenNthCalledWith(2, 'blurred');
  });

  it('syncs sp-checkbox values through the shared checked contract', async () => {
    const onChecked = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<Checkbox checked={false} onChecked={onChecked}>Enabled</Checkbox>);
    });

    const checkbox = container.querySelector<SpectrumCheckboxElement>('sp-checkbox');
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox!.checked = true;
      checkbox!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChecked).toHaveBeenCalledWith(true);
  });
});

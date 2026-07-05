import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox, Radio, TextField } from '../../../../src/shared/ui/primitives/native-controls';
import { IconButton } from '../../../../src/shared/ui/primitives/icon-button';
import { Icon } from '../../../../src/shared/ui/components/icons';

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

  it('syncs radio values through the shared checked contract', async () => {
    const onChecked = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<Radio name="preferred-endpoint" checked={false} onChecked={onChecked}>Preferred</Radio>);
    });

    const radio = container.querySelector<HTMLInputElement>('input[type="radio"]');
    expect(radio).not.toBeNull();

    await act(async () => {
      radio!.click();
    });

    expect(onChecked).toHaveBeenCalledWith(true);
  });

  it('keeps compact square icon buttons constrained across host, button, and overlay layers', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <IconButton
          variant="negative"
          compactSquare
          icon={<Icon name="trash" />}
          tooltip="Delete"
        />,
      );
    });

    const host = container.querySelector('.ui-icon-button-host');
    const button = container.querySelector('button');
    const overlay = container.querySelector('.ui-icon-button-overlay');

    expect(host?.className).toContain('ui-icon-button-host--compact-square');
    expect(button?.className).toContain('ui-icon-button--compact-square');
    expect(overlay?.className).toContain('ui-icon-button-overlay--compact-square');
  });
});

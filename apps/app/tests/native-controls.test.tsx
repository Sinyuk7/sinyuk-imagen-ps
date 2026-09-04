import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox, Radio } from '../src/shared/ui/primitives/native-controls';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function render(node: React.ReactNode): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

describe('Spectrum choice controls', () => {
  it('omits unchecked boolean attributes and syncs native change events', async () => {
    if (!customElements.get('sp-checkbox')) customElements.define('sp-checkbox', class extends HTMLElement {});
    const onChecked = vi.fn();
    const view = await render(<Checkbox checked={false} onChecked={onChecked}>启用</Checkbox>);
    const control = view.querySelector('sp-checkbox') as HTMLElement & { checked: boolean };
    expect(control).not.toBeNull();
    expect(control.hasAttribute('checked')).toBe(false);
    control.checked = true;
    await act(async () => control.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onChecked).toHaveBeenCalledWith(true);
    await act(async () => root?.render(<Checkbox checked onChecked={onChecked}>启用</Checkbox>));
    expect((view.querySelector('sp-checkbox') as HTMLElement & { checked: boolean }).checked).toBe(true);
    expect(view.querySelector('.ui-checkbox-label')?.textContent).toBe('启用');
  });

  it('keeps disabled and invalid state on the same adapter for radio', async () => {
    const view = await render(<Radio checked onChecked={() => undefined} disabled invalid>选择</Radio>);
    const control = view.querySelector('sp-radio, [data-spectrum-choice-fallback="radio"]');
    expect(control).not.toBeNull();
    expect(control?.getAttribute('aria-checked') ?? control?.hasAttribute('checked')).toBeTruthy();
    expect(control?.getAttribute('aria-disabled') ?? control?.hasAttribute('disabled')).toBeTruthy();
    expect(control?.getAttribute('data-invalid') ?? control?.hasAttribute('invalid')).toBeTruthy();
    expect(view.querySelector('.ui-radio')).not.toBeNull();
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionButton, Button, Checkbox, Radio } from '../src/shared/ui/primitives/native-controls';

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

describe('Spectrum action button descriptions', () => {
  it('keeps the accessible name stable while updating the native tooltip text', async () => {
    if (!customElements.get('sp-action-button')) customElements.define('sp-action-button', class extends HTMLElement {});
    const summary = ['模型: A', '模板: B'].join('\n');
    const view = await render(<ActionButton label="生成设置" tooltipText={summary} aria-description={summary}>设置</ActionButton>);
    const control = view.querySelector('sp-action-button');
    expect(control?.getAttribute('aria-label')).toBe('生成设置');
    expect(control?.getAttribute('title')).toBe('');
    expect(control?.getAttribute('aria-description')).toBe(summary);
    const tooltip = control?.querySelector('sp-tooltip');
    expect(Array.from(tooltip?.querySelectorAll('.ui-tooltip-line') ?? []).map((line) => line.textContent)).toEqual(['模型: A', '模板: B']);
    expect(control?.getAttribute('aria-describedby')).toBe(tooltip?.id);
    const updatedSummary = ['模型: C', '模板: Other'].join('\n');
    await act(async () => root?.render(<ActionButton label="生成设置" tooltipText={updatedSummary} aria-description={updatedSummary}>设置</ActionButton>));
    expect(Array.from(view.querySelector('sp-action-button')?.querySelectorAll('.ui-tooltip-line') ?? []).map((line) => line.textContent)).toEqual(['模型: C', '模板: Other']);
    await act(async () => root?.render(<ActionButton label="生成设置" tooltipText={null} aria-description="模型: C">设置</ActionButton>));
    expect(view.querySelector('sp-action-button')?.getAttribute('aria-label')).toBe('生成设置');
    expect(view.querySelector('sp-action-button')?.getAttribute('title')).toBe('');
    expect(view.querySelector('sp-action-button sp-tooltip')).toBeNull();
  });
});

describe('disabled button descriptions', () => {
  it('keeps a described disabled action keyboard reachable without allowing native activation', async () => {
    if (!customElements.get('sp-button')) customElements.define('sp-button', class extends HTMLElement {});
    const onClick = vi.fn();
    const view = await render(<Button disabled disabledFocusable aria-description="选择模型后可运行" onClick={onClick}>运行</Button>);
    const control = view.querySelector('sp-button');
    expect(control?.hasAttribute('aria-disabled')).toBe(true);
    expect(control?.getAttribute('tabindex')).toBe('0');
    expect(control?.hasAttribute('disabled')).toBe(false);
    expect(control?.getAttribute('aria-description')).toBe('选择模型后可运行');
    await act(async () => control?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(onClick).not.toHaveBeenCalled();
  });
});

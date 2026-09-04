import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as UiSystem from '../../../src/shared/ui/ui-system';
import { FieldGroup, FooterActions, PageHeader, PageScroll, PageState, SegmentedTabs, SettingsFormSection, SettingsListRow, SettingsListSection } from '../../../src/shared/ui/ui-system';
import { BASE_CSS } from '../../../src/shared/ui/styles/base';
import { PATTERNS_CSS } from '../../../src/shared/ui/styles/patterns';

let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; });

async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

describe('page patterns', () => {
  it('keeps the Spectrum theme at the panel size', () => {
    expect(BASE_CSS).toContain('#root,\n.app-spectrum-theme{ width:100%; height:100%; }');
    expect(BASE_CSS).toContain('.app-spectrum-theme{ display:block; }');
  });

  it('exposes page-facing symbols without a barrel cycle', () => {
    expect(UiSystem.PageHeader).toBeTypeOf('function');
    expect(UiSystem.Button).toBeTypeOf('object');
    expect(UiSystem.SettingsListRow).toBeTypeOf('function');
  });

  it('owns header placeholder and primary scroll', async () => {
    const container = await render(<><PageHeader title="Settings" backLabel="Back" onBack={() => undefined} /><PageScroll>Body</PageScroll></>);
    expect(container.querySelector('.ui-page-header-end')).not.toBeNull();
    expect(container.querySelector('.ui-page-header')).not.toBeNull();
    expect(container.querySelector('[data-icon-name="chevron-left"]')).not.toBeNull();
    expect(container.querySelector('sp-action-button[aria-label="Back"]')?.textContent).toBe('');
    expect(container.querySelector('[data-primary-scroll="true"]')).not.toBeNull();
  });

  it('exposes selected, disabled, and keyboard tab semantics', async () => {
    const onSelect = vi.fn();
    const container = await render(<SegmentedTabs selectedId="one" onSelect={onSelect} tabs={[{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }, { id: 'three', label: 'Three', disabled: true }]} />);
    const list = container.querySelector('[role="tablist"]')!;
    await act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith('two');
    expect(container.querySelector('[data-tab-id="one"]')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-tab-id="three"]')?.hasAttribute('disabled')).toBe(true);
    expect(PATTERNS_CSS).toContain('border-radius:var(--app-radius-small)');
    expect(PATTERNS_CSS).toContain('.ui-segmented-tab[aria-selected="true"]');
    expect(PATTERNS_CSS).toContain('.ui-segmented-tab:focus-visible');
    expect(PATTERNS_CSS).toContain('.ui-segmented-tab:disabled');
    expect(container.querySelector('[data-tab-id="one"]')?.getAttribute('tabindex')).toBe('0');
    expect(container.querySelector('[data-tab-id="two"]')?.getAttribute('tabindex')).toBe('-1');
    expect(container.querySelector('[data-tab-id="three"]')?.getAttribute('aria-disabled')).toBe('true');
    await act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith('two');
  });

  it('provides bounded section, field, state, and footer shells', async () => {
    const container = await render(<><SettingsListSection title="List">Row</SettingsListSection><SettingsListSection testId="untitled-list">Row</SettingsListSection><SettingsFormSection title="Form"><FieldGroup label="Name">Control</FieldGroup></SettingsFormSection><SettingsFormSection testId="untitled-form">Control</SettingsFormSection><PageState tone="neutral" message="Empty" variant="empty" /><FooterActions>Save</FooterActions></>);
    expect(container.querySelector('.ui-settings-list-section h2')?.textContent).toBe('List');
    expect(container.querySelector('[data-testid="untitled-list"] h2')).toBeNull();
    expect(container.querySelector('[data-testid="untitled-form"] h2')).toBeNull();
    expect(container.querySelector('.ui-field-group-label')?.textContent).toBe('Name');
    expect(container.querySelector('.ui-page-state')).not.toBeNull();
    expect(container.querySelector('.ui-page-state')?.getAttribute('data-variant')).toBe('empty');
    expect(container.querySelector('.ui-page-state-empty')).not.toBeNull();
    expect(container.querySelector('.ui-footer-actions')?.textContent).toBe('Save');
  });

  it('preserves page pattern names, states, and relationships', async () => {
    const container = await render(<><PageHeader title="Provider" backLabel="Back" onBack={() => undefined} /><FieldGroup label="Endpoint" help="Required">Control</FieldGroup><PageState tone="negative" message="Failed" /><SettingsListRow title="Profile" leading={<span>P</span>} disabled onOpen={() => undefined} /></>);
    expect(container.querySelector('header h1')?.textContent).toBe('Provider');
    expect(container.querySelector('[data-testid]')).toBeNull();
    expect(container.querySelector('sp-action-button[aria-label="Back"]')).not.toBeNull();
    expect(container.querySelector('.ui-field-group-label')?.textContent).toBe('Endpoint');
    const disabledRow = container.querySelector('[role="button"].settings-provider-row');
    expect(disabledRow?.getAttribute('tabindex')).toBe('-1');
    expect(disabledRow?.getAttribute('aria-disabled')).toBe('true');
    expect(disabledRow?.className).toContain('is-disabled');
  });
});

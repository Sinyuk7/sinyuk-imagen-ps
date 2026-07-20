import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as UiSystem from '../../../src/shared/ui/ui-system';
import { FieldGroup, FooterActions, PageHeader, PageScroll, PageState, SegmentedTabs, SettingsFormSection, SettingsListRow, SettingsListSection } from '../../../src/shared/ui/ui-system';
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
    expect(container.querySelector('button[aria-label="Back"]')?.textContent).toBe('');
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
  });

  it('provides bounded section, field, state, and footer shells', async () => {
    const container = await render(<><SettingsListSection title="List">Row</SettingsListSection><SettingsFormSection title="Form"><FieldGroup label="Name">Control</FieldGroup></SettingsFormSection><PageState tone="neutral" message="Empty" variant="empty" /><FooterActions>Save</FooterActions></>);
    expect(container.querySelector('.ui-settings-list-section h2')?.textContent).toBe('List');
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
    expect(container.querySelector('button[aria-label="Back"]')).not.toBeNull();
    expect(container.querySelector('.ui-field-group-label')?.textContent).toBe('Endpoint');
    expect(container.querySelector('[role="button"]')?.getAttribute('tabindex')).toBe('-1');
    expect(container.querySelector('[role="button"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(container.querySelector('[role="button"]')?.className).toContain('is-disabled');
  });
});

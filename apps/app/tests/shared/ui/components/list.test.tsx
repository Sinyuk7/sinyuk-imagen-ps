import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { List, ListItemShell, ListStateItem, SettingsListRow } from '../../../../src/shared/ui/ui-system';

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

describe('shared list primitives', () => {
  it('keeps List render-only and gives every shell shared geometry', async () => {
    const container = await render(
      <List aria-label="Providers">
        <ListItemShell data-testid="real" icon={<span>R</span>} title="Real" description="Configured" trailing={<span>Ready</span>} onPress={() => undefined} />
        <ListStateItem data-testid="loading" kind="loading" />
      </List>,
    );

    expect(container.querySelector('.ui-list')?.getAttribute('aria-label')).toBe('Providers');
    expect(container.querySelectorAll('.ui-list-item-shell')).toHaveLength(2);
    expect(container.querySelector('[data-testid="real"]')?.getAttribute('role')).toBe('button');
    expect(container.querySelector('[data-testid="loading"] .ui-list-item-leading [data-icon-name="spinner"]')).not.toBeNull();
  });

  it('keeps a state item inert without a direct action', async () => {
    const container = await render(<ListStateItem data-testid="empty" kind="empty" title="None" />);
    const item = container.querySelector<HTMLElement>('[data-testid="empty"]')!;

    await act(async () => item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.hasAttribute('role')).toBe(false);
    expect(item.hasAttribute('tabindex')).toBe(false);
    expect(item.querySelector('[data-icon-name="empty"]')).not.toBeNull();
    expect(item.querySelector('button')).toBeNull();
  });

  it('puts the only state action in trailing button without row navigation', async () => {
    const onRetry = vi.fn();
    const container = await render(<ListStateItem data-testid="error" kind="error" action={{ label: 'Retry', onPress: onRetry }} />);
    const item = container.querySelector<HTMLElement>('[data-testid="error"]')!;
    const action = item.querySelector<HTMLButtonElement>('button')!;

    expect(item.getAttribute('role')).toBeNull();
    expect(action.parentElement?.className).toContain('ui-list-item-trailing');
    await act(async () => action.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('blocks disabled SettingsListRow pointer and keyboard activation', async () => {
    const onOpen = vi.fn();
    const container = await render(<SettingsListRow title="Disabled" leading={<span>D</span>} disabled onOpen={onOpen} />);
    const row = container.querySelector<HTMLElement>('[role="button"]')!;

    await act(async () => {
      row.click();
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onOpen).not.toHaveBeenCalled();
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.getAttribute('tabindex')).toBe('-1');
    expect(row.querySelector('.prov-trail')).toBeNull();
  });
});

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServices } from '../../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../../helpers/main-page-harness';

describe('Settings provider list', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('uses one inert empty list row and keeps Header add as the only CTA', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, createFakeServices({ profiles: [] }));

    await act(async () => { container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click(); });
    await flush();

    const empty = container.querySelector<HTMLElement>('[data-testid="provider-empty-state"]');
    expect(empty?.classList.contains('ui-list-state-item')).toBe(true);
    expect(empty?.getAttribute('aria-disabled')).toBe('true');
    expect(empty?.querySelector('button')).toBeNull();
    expect(container.querySelector('[data-testid="providers-add-button"]')).not.toBeNull();
  });
});

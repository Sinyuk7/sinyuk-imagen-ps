import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServices } from '../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../helpers/main-page-harness';

async function openSettings(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
  });
  await flush();
  await flush();
}

describe('AppShell settings empty state', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('lands in provider empty state when no provider profiles exist', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ profiles: [] });
    await renderMainPage(container, fake);

    await openSettings(container);

    expect(container.textContent).toContain('暂无 Provider 配置');
  });
});

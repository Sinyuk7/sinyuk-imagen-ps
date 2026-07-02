import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupSettingsDetailRoot,
  flush,
  queryByTestId,
  renderDetail,
} from './settings-detail-harness';

afterEach(async () => {
  await cleanupSettingsDetailRoot();
});

describe('SettingsDetailPage contract — billing', () => {
  it('renders billing summary and refresh action for non-optimizer profiles', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    expect(container.textContent).toContain('Billing');
    expect(container.textContent).toContain('当前余额: 12.50 USD');
    expect(container.querySelector('[data-testid="provider-billing-mode-selector"]')).not.toBeNull();

    await act(async () => {
      queryByTestId(container, 'provider-billing-refresh-button').click();
    });
    await flush();

    expect(spies.refreshProfileBalance).toHaveBeenCalledWith({ profileId: 'mock-profile' });
    expect(container.textContent).toContain('12.50 USD');
  });
});

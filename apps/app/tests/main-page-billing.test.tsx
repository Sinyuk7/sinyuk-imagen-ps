import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServices } from './fakes';
import { cleanupMainPageRoot, flush, renderMainPage, sendPrompt } from './main-page-harness';

afterEach(async () => {
  // Drain pending billing async refreshes while the root is still mounted,
  // so setBilling does not fire after happy-dom tears down for this file.
  await flush();
  await flush();
  await flush();
  await cleanupMainPageRoot();
});

describe('MainPage contract — billing', () => {
  it('shows billing summary in the main header after balance refresh state exists', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.getProfileBillingState.mockResolvedValue({
      ok: true as const,
      value: {
        refreshState: 'idle',
        balance: {
          profileId: 'mock-profile',
          providerId: 'mock',
          checkedAt: Date.now(),
          snapshot: {
            primary: {
              kind: 'money',
              remaining: '12.50',
              currency: 'USD',
            },
          },
        },
      },
    });

    await renderMainPage(container, services);

    const billingSummary = container.querySelector<HTMLElement>('[data-testid="main-billing-summary"]');
    expect(billingSummary?.textContent).toContain('12.50 USD');
    expect(billingSummary?.closest('.cmp-action-left')?.querySelector('[data-testid="composer-prompt-optimize-button"]')).not.toBeNull();
  });

  it('updates billing status after generation when async billing state settles with a balance change', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    let billingReads = 0;
    services.spies.getProfileBillingState.mockImplementation(async () => {
      billingReads += 1;
      if (billingReads < 2) {
        return { ok: true as const, value: { refreshState: 'idle' } };
      }
      return {
        ok: true as const,
        value: {
          refreshState: 'idle',
          lastBalanceChange: {
            amount: '0.50',
            currency: 'USD',
            direction: 'decreased',
          },
        },
      };
    });

    await renderMainPage(container, services);
    await sendPrompt(container, 'billing toast');
    await flush();
    await flush();
    await flush();

    expect(container.textContent).toContain('最近一次余额变化: -0.5 USD');
  });
});

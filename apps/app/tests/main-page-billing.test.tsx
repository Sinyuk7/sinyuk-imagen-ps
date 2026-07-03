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
    expect(billingSummary?.textContent).not.toContain('Balance');
    expect(billingSummary?.querySelector('.cmp-balance-pill-primary')?.textContent).toBe('12.50');
    expect(billingSummary?.querySelector('.cmp-balance-pill-unit')?.textContent).toBe(' USD');
    expect(billingSummary?.querySelector('.cmp-balance-pill-primary')?.className).toContain('cmp-balance-pill-primary-accent');
    expect(billingSummary?.querySelector('.cmp-balance-pill-label')).toBeNull();
    expect(billingSummary?.getAttribute('title')).toContain('12.50 USD');
    expect(billingSummary?.closest('.cmp-action-left')?.querySelector('[data-testid="composer-prompt-optimize-button"]')).not.toBeNull();
  });

  it('compacts quota summaries in the main header', async () => {
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
              kind: 'quota',
              remaining: '2227206',
              unit: 'quota',
            },
          },
        },
      },
    });

    await renderMainPage(container, services);

    const billingSummary = container.querySelector<HTMLElement>('[data-testid="main-billing-summary"]');
    expect(billingSummary?.textContent).toContain('2.2M quota');
    expect(billingSummary?.textContent).not.toContain('2227206 quota');
    expect(billingSummary?.querySelector('.cmp-balance-pill-primary')?.textContent).toBe('2.2M');
    expect(billingSummary?.querySelector('.cmp-balance-pill-unit')?.textContent).toBe(' quota');
    expect(billingSummary?.querySelector('.cmp-balance-pill-primary')?.className).toContain('cmp-balance-pill-primary-accent');
    expect(billingSummary?.querySelector('.cmp-balance-pill-label')).toBeNull();
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

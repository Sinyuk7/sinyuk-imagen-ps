import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServices } from './fakes';
import { cleanupMainPageRoot, flush, renderMainPage, sendPrompt } from './main-page-harness';
import type { Job } from '@imagen-ps/application';

afterEach(async () => {
  // Drain pending billing async refreshes while the root is still mounted,
  // so setBilling does not fire after happy-dom tears down for this file.
  await flush();
  await flush();
  await flush();
  await cleanupMainPageRoot();
});

describe('MainPage contract — billing', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((innerResolve) => {
      resolve = innerResolve;
    });
    return { promise, resolve };
  }

  function completedJob(id: string, input: Record<string, unknown>): Job {
    return {
      id,
      status: 'completed',
      input,
      output: {
        image: {
          assets: [],
          text: `[prompt=${String(input.prompt ?? '')}]`,
        },
      },
      error: undefined,
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:01.000Z',
    };
  }

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
    expect(billingSummary?.textContent).toContain('2.227M quota');
    expect(billingSummary?.textContent).not.toContain('2227206 quota');
    expect(billingSummary?.querySelector('.cmp-balance-pill-primary')?.textContent).toBe('2.227M');
    expect(billingSummary?.querySelector('.cmp-balance-pill-unit')?.textContent).toBe(' quota');
    expect(billingSummary?.querySelector('.cmp-balance-pill-primary')?.className).toContain('cmp-balance-pill-primary-accent');
    expect(billingSummary?.querySelector('.cmp-balance-pill-label')).toBeNull();
  });

  it('keeps quota summaries sensitive inside the same million bucket', async () => {
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
              remaining: '1398224',
              unit: 'quota',
            },
          },
        },
      },
    });

    await renderMainPage(container, services);

    const billingSummary = container.querySelector<HTMLElement>('[data-testid="main-billing-summary"]');
    expect(billingSummary?.textContent).toContain('1.398M quota');
    expect(billingSummary?.textContent).not.toContain('1.4M quota');
    expect(billingSummary?.querySelector('.cmp-balance-pill-primary')?.textContent).toBe('1.398M');
  });

  it('attaches observed balance change to the completed round without a positive toast', async () => {
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

    expect(container.querySelector('[data-testid^="round-billing-meta-"]')?.textContent).toContain('检测到的余额变化: -0.5 USD');
    expect(container.querySelector('[data-testid="toast"]')?.textContent ?? '').not.toContain('-0.5 USD');
  });

  it('labels exact provider task cost as Cost on round metadata', async () => {
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
          lastExactTaskCost: {
            amount: '0.08',
            currency: 'CNY',
            completeness: 'complete',
          },
        },
      };
    });

    await renderMainPage(container, services);
    await sendPrompt(container, 'billing exact cost');
    await flush();
    await flush();
    await flush();

    expect(container.querySelector('[data-testid^="round-billing-meta-"]')?.textContent).toContain('费用: 0.08 CNY');
    expect(container.querySelector('[data-testid^="round-billing-meta-"]')?.textContent).not.toContain('检测到的余额变化');
  });

  it('attaches billing observation to the submitted round when an older completed round has no meta', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    const first = deferred<{ readonly ok: true; readonly value: Job }>();
    let submitCount = 0;
    services.spies.submitJob.mockImplementation(async (request: { input: Record<string, unknown> }) => {
      submitCount += 1;
      if (submitCount === 1) {
        return first.promise;
      }
      return {
        ok: true as const,
        value: completedJob('job-billing-new', request.input),
      };
    });
    let billingReads = 0;
    services.spies.getProfileBillingState.mockImplementation(async () => {
      billingReads += 1;
      if (billingReads < 4) {
        return { ok: true as const, value: { refreshState: 'idle' } };
      }
      return {
        ok: true as const,
        value: {
          refreshState: 'idle',
          lastExactTaskCost: {
            amount: '0.12',
            currency: 'USD',
            completeness: 'complete',
          },
        },
      };
    });

    await renderMainPage(container, services);
    await act(async () => {
      const textarea = container.querySelector<HTMLTextAreaElement>('.cmp-ta')!;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'old billing round');
      textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!.click();
    });
    await flush();
    first.resolve({
      ok: true as const,
      value: completedJob('job-billing-old', { prompt: 'old billing round' }),
    });
    await flush();
    await flush();
    await sendPrompt(container, 'new billing round');
    await flush();
    await flush();
    await flush();

    const oldRound = Array.from(container.querySelectorAll<HTMLElement>('[data-round-id]')).find((round) =>
      round.textContent?.includes('old billing round'),
    );
    const newRound = Array.from(container.querySelectorAll<HTMLElement>('[data-round-id]')).find((round) =>
      round.textContent?.includes('new billing round'),
    );
    expect(oldRound?.querySelector('[data-testid^="round-billing-meta-"]')).toBeNull();
    expect(newRound?.querySelector('[data-testid^="round-billing-meta-"]')?.textContent).toContain('费用: 0.12 USD');
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DurableJobRecord } from '@imagen-ps/application';
import type { ConversationRound } from '../src/shared/ui/hooks/use-conversation';
import { HistoryPage } from '../src/shared/ui/pages/history-page';
import { fakeAsset, fakeDurableRecord } from './fakes';
import { TestI18nProvider } from './render-helpers';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

describe('HistoryPage', () => {
  async function renderHistory(input: {
    readonly rounds?: readonly ConversationRound[];
    readonly records?: readonly DurableJobRecord[];
    readonly onRetry?: (roundId: string) => Promise<void>;
    readonly onLocateRound?: (roundId: string) => void;
    readonly onMiss?: () => void;
  } = {}): Promise<HTMLDivElement> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestI18nProvider>
          <HistoryPage
            onNav={vi.fn()}
            rounds={input.rounds ?? []}
            records={input.records ?? [fakeDurableRecord]}
            loading={false}
            onReload={vi.fn(async () => undefined)}
            onRetry={input.onRetry ?? vi.fn(async () => undefined)}
            onLocateRound={input.onLocateRound}
            onMiss={input.onMiss}
          />
        </TestI18nProvider>,
      );
    });

    return container;
  }

  it('renders durable job records from application history', async () => {
    const container = await renderHistory();

    expect(container.textContent).toContain('history prompt');
    expect(container.textContent).toContain('mock-profile');
    expect(container.textContent).toContain('完成');
  });

  it('merges durable records with running rounds from current session', async () => {
    const runningRound: ConversationRound = {
      id: 'round-running',
      time: '9:30',
      prompt: 'running prompt',
      status: 'running',
      providerName: 'Mock Profile',
      elapsedSeconds: 2,
      previews: [],
      attachments: [],
    };

    const container = await renderHistory({ rounds: [runningRound], records: [fakeDurableRecord] });

    expect(container.textContent).toContain('running prompt');
    expect(container.textContent).toContain('history prompt');
    expect(container.textContent).toContain('运行中');
  });

  it('filters by completed, running, and failed status', async () => {
    const runningRound: ConversationRound = {
      id: 'round-running',
      time: '9:30',
      prompt: 'running prompt',
      status: 'running',
      providerName: 'Mock Profile',
      elapsedSeconds: 2,
      previews: [],
      attachments: [],
    };
    const failedRecord: DurableJobRecord = {
      ...fakeDurableRecord,
      jobId: 'job-history-failed',
      status: 'failed',
      input: { profileId: 'mock-profile', prompt: 'failed durable prompt' },
      updatedAt: '2026-06-15T00:00:02.000Z',
      error: { category: 'provider', message: 'failed' },
    };

    const container = await renderHistory({ rounds: [runningRound], records: [fakeDurableRecord, failedRecord] });

    const filters = Array.from(container.querySelectorAll<HTMLButtonElement>('.fchip'));

    await act(async () => {
      filters.find((button) => button.textContent === '完成')!.click();
    });
    expect(container.textContent).toContain('history prompt');
    expect(container.textContent).not.toContain('running prompt');
    expect(container.textContent).not.toContain('failed durable prompt');

    await act(async () => {
      filters.find((button) => button.textContent === '运行中')!.click();
    });
    expect(container.textContent).toContain('running prompt');
    expect(container.textContent).not.toContain('history prompt');
    expect(container.textContent).not.toContain('failed durable prompt');

    await act(async () => {
      filters.find((button) => button.textContent === '失败')!.click();
    });
    expect(container.textContent).toContain('failed durable prompt');
    expect(container.textContent).not.toContain('history prompt');
    expect(container.textContent).not.toContain('running prompt');
  });

  it('calls onRetry from failed round retry action', async () => {
    const onRetry = vi.fn(async () => undefined);
    const failedRound: ConversationRound = {
      id: 'round-failed',
      time: '9:31',
      prompt: 'failed session prompt',
      status: 'err',
      providerName: 'Mock Profile',
      elapsedSeconds: 3,
      elapsedLabel: '3s',
      errorMessage: 'provider failed',
      jobId: 'job-failed',
      previews: [{ asset: fakeAsset, url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==', label: 'result.png' }],
      attachments: [],
    };

    const container = await renderHistory({ rounds: [failedRound], records: [], onRetry });

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
        button.textContent?.includes('重试'),
      )!.click();
    });

    expect(onRetry).toHaveBeenCalledWith('round-failed');
  });

  it('calls onLocateRound when a current-session round is clicked', async () => {
    const onLocateRound = vi.fn();
    const onMiss = vi.fn();
    const runningRound: ConversationRound = {
      id: 'round-running',
      time: '9:30',
      prompt: 'running prompt',
      status: 'running',
      providerName: 'Mock Profile',
      elapsedSeconds: 2,
      previews: [],
      attachments: [],
    };

    const container = await renderHistory({ rounds: [runningRound], records: [], onLocateRound, onMiss });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="history-row-round-running"]')!.click();
    });

    expect(onLocateRound).toHaveBeenCalledWith('round-running');
    expect(onMiss).not.toHaveBeenCalled();
  });

  it('calls onMiss when a durable record is clicked', async () => {
    const onLocateRound = vi.fn();
    const onMiss = vi.fn();

    const container = await renderHistory({ records: [fakeDurableRecord], onLocateRound, onMiss });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="history-row-job-history-1"]')!.click();
    });

    expect(onLocateRound).not.toHaveBeenCalled();
    expect(onMiss).toHaveBeenCalled();
  });
});

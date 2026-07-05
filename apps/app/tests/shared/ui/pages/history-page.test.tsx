import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '@imagen-ps/application';
import type { TaskResourceResolverPort } from '../../../../src/shared/ports/app-services';
import type { ConversationRound } from '../../../../src/shared/ui/hooks/use-conversation';
import { HistoryPage } from '../../../../src/shared/ui/pages/history-page';
import { fakeAsset, fakeTaskRecord } from '../../../helpers/fakes';
import { TestToastSurface } from '../../../helpers/render-helpers';

let root: Root | undefined;
let observers: FakeIntersectionObserver[] = [];

class FakeIntersectionObserver {
  readonly callback: IntersectionObserverCallback;
  readonly elements = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(element: Element): void {
    this.elements.add(element);
  }

  unobserve(element: Element): void {
    this.elements.delete(element);
  }

  disconnect(): void {
    this.elements.clear();
  }

  trigger(element: Element, isIntersecting = true): void {
    this.callback([{
      target: element,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: element.getBoundingClientRect(),
      intersectionRect: element.getBoundingClientRect(),
      rootBounds: null,
      time: Date.now(),
    } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  observers = [];
  delete (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
});

describe('HistoryPage', () => {
  async function renderHistory(input: {
    readonly rounds?: readonly ConversationRound[];
    readonly records?: readonly TaskRecord[];
    readonly taskResources?: TaskResourceResolverPort;
    readonly onDownloadTaskOutput?: (record: TaskRecord, outputId: string) => Promise<void>;
    readonly onRetry?: (roundId: string) => Promise<void>;
    readonly onPlaceTaskOutput?: (record: TaskRecord, outputId: string) => Promise<void>;
    readonly onLocateRound?: (roundId: string) => void;
    readonly onMiss?: () => void;
  } = {}): Promise<HTMLDivElement> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestToastSurface>
          <HistoryPage
            onNav={vi.fn()}
            rounds={input.rounds ?? []}
            records={input.records ?? [fakeTaskRecord]}
            loading={false}
            onReload={vi.fn(async () => undefined)}
            onRetry={input.onRetry ?? vi.fn(async () => undefined)}
            taskResources={input.taskResources}
            onDownloadTaskOutput={input.onDownloadTaskOutput}
            onPlaceTaskOutput={input.onPlaceTaskOutput}
            onLocateRound={input.onLocateRound}
            onMiss={input.onMiss}
          />
        </TestToastSurface>,
      );
    });

    return container;
  }

  it('renders durable task records from application history', async () => {
    const container = await renderHistory();

    expect(container.textContent).toContain('history prompt');
    expect(container.textContent).toContain('Mock Profile');
    expect(container.textContent).toContain('完成');
  });

  it('merges durable records with running rounds from current session by task id', async () => {
    const runningRound: ConversationRound = {
      id: fakeTaskRecord.taskId,
      time: '9:30',
      createdAt: fakeTaskRecord.createdAt,
      prompt: 'running prompt',
      status: 'running',
      providerName: 'Mock Profile',
      elapsedSeconds: 2,
      previews: [],
      attachments: [],
      placementIntent: { kind: 'unbound', reason: 'no-photoshop-capture' },
    };

    const container = await renderHistory({ rounds: [runningRound], records: [fakeTaskRecord] });

    expect(container.querySelectorAll('[data-testid^="history-row-"]')).toHaveLength(1);
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
      placementIntent: { kind: 'unbound', reason: 'no-photoshop-capture' },
    };
    const failedRecord: TaskRecord = {
      ...fakeTaskRecord,
      taskId: 'task-history-failed',
      status: 'failed',
      prompt: 'failed durable prompt',
      outputs: [],
      updatedAt: '2026-06-15T00:00:02.000Z',
      error: { category: 'provider', message: 'failed' },
      finishedAt: '2026-06-15T00:00:02.000Z',
    };

    const container = await renderHistory({ rounds: [runningRound], records: [fakeTaskRecord, failedRecord] });

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
      placementIntent: { kind: 'unbound', reason: 'no-photoshop-capture' },
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
      placementIntent: { kind: 'unbound', reason: 'no-photoshop-capture' },
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

    const container = await renderHistory({ records: [fakeTaskRecord], onLocateRound, onMiss });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="history-row-task-history-1"]')!.click();
    });

    expect(onLocateRound).not.toHaveBeenCalled();
    expect(onMiss).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain('该任务属于其他会话');
  });

  it('routes durable task downloads through the supplied task action', async () => {
    (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const resolver: TaskResourceResolverPort = {
      resolve: vi.fn(async () => ({
        resource: fakeTaskRecord.outputs[0]!.asset,
        availability: 'available',
        bytes: new Uint8Array([1, 2, 3]).buffer,
        preview: { url: 'blob:history-preview', dispose: vi.fn() },
      })),
    };
    const onDownloadTaskOutput = vi.fn(async () => undefined);

    const container = await renderHistory({ records: [fakeTaskRecord], taskResources: resolver, onDownloadTaskOutput });
    expect(resolver.resolve).not.toHaveBeenCalled();
    await act(async () => {
      observers[0]?.trigger(container.querySelector('[data-testid="history-row-task-history-1"] .task-thumb')!);
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLImageElement>('img')?.src).toBe('blob:history-preview');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="history-download-button-task-history-1"]')!.click();
    });

    expect(onDownloadTaskOutput).toHaveBeenCalledWith(fakeTaskRecord, 'task-history-1:output:0');
  });

  it('disables unavailable durable resource actions', async () => {
    (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const resolver: TaskResourceResolverPort = {
      resolve: vi.fn(async () => ({
        resource: fakeTaskRecord.outputs[0]!.asset,
        availability: 'missing',
      })),
    };

    const container = await renderHistory({ records: [fakeTaskRecord], taskResources: resolver });
    await act(async () => {
      observers[0]?.trigger(container.querySelector('[data-testid="history-row-task-history-1"] .task-thumb')!);
      await Promise.resolve();
    });

    const download = container.querySelector<HTMLButtonElement>('[data-testid="history-download-button-task-history-1"]');
    const place = container.querySelector<HTMLButtonElement>('[data-testid="history-place-button-task-history-1"]');
    expect(download?.disabled).toBe(true);
    expect(place?.disabled).toBe(true);
  });

  it('keeps remote-only URL outputs visible and unavailable for download', async () => {
    const record: TaskRecord = {
      ...fakeTaskRecord,
      outputs: [{
        ...fakeTaskRecord.outputs[0]!,
        asset: { ref: { kind: 'url', ref: 'https://example.test/output.png', name: 'output.png', mimeType: 'image/png' } },
      }],
    };

    const container = await renderHistory({ records: [record] });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLImageElement>('img')?.src).toBe('https://example.test/output.png');
    expect(container.querySelector<HTMLButtonElement>('[data-testid="history-download-button-task-history-1"]')?.disabled).toBe(true);
  });

  it('routes durable task placement through the supplied task action', async () => {
    (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const resolver: TaskResourceResolverPort = {
      resolve: vi.fn(async () => ({
        resource: fakeTaskRecord.outputs[0]!.asset,
        availability: 'available',
        bytes: new Uint8Array([1, 2, 3]).buffer,
      })),
    };
    const onPlaceTaskOutput = vi.fn(async () => undefined);

    const container = await renderHistory({ records: [fakeTaskRecord], taskResources: resolver, onPlaceTaskOutput });
    await act(async () => {
      observers[0]?.trigger(container.querySelector('[data-testid="history-row-task-history-1"] .task-thumb')!);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="history-place-button-task-history-1"]')!.click();
    });

    expect(onPlaceTaskOutput).toHaveBeenCalledWith(fakeTaskRecord, 'task-history-1:output:0');
  });

  it('does not resolve durable previews before they become visible', async () => {
    (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const resolver: TaskResourceResolverPort = {
      resolve: vi.fn(async () => ({
        resource: fakeTaskRecord.outputs[0]!.asset,
        availability: 'available',
        bytes: new Uint8Array([1, 2, 3]).buffer,
        preview: { url: 'blob:history-preview' },
      })),
    };

    const container = await renderHistory({ records: [fakeTaskRecord], taskResources: resolver });

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLImageElement>('img')).toBeNull();
  });

  it('does not eagerly resolve all previews when IntersectionObserver is unavailable', async () => {
    const resolver: TaskResourceResolverPort = {
      resolve: vi.fn(async () => ({
        resource: fakeTaskRecord.outputs[0]!.asset,
        availability: 'available',
        bytes: new Uint8Array([1, 2, 3]).buffer,
        preview: { url: 'blob:history-preview' },
      })),
    };

    await renderHistory({ records: [fakeTaskRecord], taskResources: resolver });

    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('releases late preview results after unmount', async () => {
    (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const dispose = vi.fn();
    let resolvePreview: ((value: Awaited<ReturnType<TaskResourceResolverPort['resolve']>>) => void) | undefined;
    const resolver: TaskResourceResolverPort = {
      resolve: vi.fn(() => new Promise((resolve) => {
        resolvePreview = resolve;
      })),
    };

    const container = await renderHistory({ records: [fakeTaskRecord], taskResources: resolver });
    await act(async () => {
      observers[0]?.trigger(container.querySelector('[data-testid="history-row-task-history-1"] .task-thumb')!);
      await Promise.resolve();
    });
    await act(async () => {
      root?.unmount();
    });
    root = undefined;

    await act(async () => {
      resolvePreview?.({
        resource: fakeTaskRecord.outputs[0]!.asset,
        availability: 'available',
        bytes: new Uint8Array([1, 2, 3]).buffer,
        preview: { url: 'blob:late-preview', dispose },
      });
      await Promise.resolve();
    });

    expect(dispose).toHaveBeenCalled();
  });
});

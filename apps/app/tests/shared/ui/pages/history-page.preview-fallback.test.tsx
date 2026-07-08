import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoredAssetRef, TaskRecord } from '@imagen-ps/application';
import { HistoryPage } from '../../../../src/shared/ui/pages/history-page';
import { flush } from '../../../helpers/main-page-harness';
import { createFakeServices, fakeTaskRecord } from '../../../helpers/fakes';
import { TestAppProviders } from '../../../helpers/render-helpers';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function buildRecord(taskId: string, ref: StoredAssetRef): TaskRecord {
  return {
    ...fakeTaskRecord,
    taskId,
    outputs: [{
      ...fakeTaskRecord.outputs[0]!,
      outputId: `${taskId}:output:0`,
      asset: { ref },
    }],
    createdAt: `2026-06-15T00:00:0${taskId.length}.000Z`,
    updatedAt: `2026-06-15T00:00:1${taskId.length}.000Z`,
    finishedAt: `2026-06-15T00:00:2${taskId.length}.000Z`,
  };
}

async function click(element: Element | null): Promise<void> {
  expect(element).not.toBeNull();
  await act(async () => {
    (element as HTMLElement).click();
  });
}

describe('HistoryPage preview fallback', () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = undefined;
    document.body.innerHTML = '';
  });

  it('shows loading fallback while a history thumbnail is still resolving', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });
    const pending = deferred<{
      resource: TaskRecord['outputs'][0]['asset'];
      availability: 'available';
      bytes: ArrayBuffer;
      preview?: { readonly url: string };
    }>();
    const record = buildRecord('loading-task', {
      kind: 'hostObject',
      ref: 'loading-ref',
      mimeType: 'image/png',
    });

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TestAppProviders services={fake.services}>
          <HistoryPage
            onNav={() => undefined}
            rounds={[]}
            records={[record]}
            loading={false}
            onReload={async () => undefined}
            onRetry={async () => undefined}
            onMiss={() => undefined}
            taskResources={{
              resolve: async () => pending.promise,
            }}
          />
        </TestAppProviders>,
      );
    });

    await click(container.querySelector('[data-testid="history-row-loading-task"]'));
    await flush();

    const loading = container.querySelector('[data-testid="history-row-loading-task"] .image-fallback[data-state="loading"]');
    expect(loading).not.toBeNull();

    pending.resolve({
      resource: record.outputs[0]!.asset,
      availability: 'available',
      bytes: new Uint8Array([1, 2, 3]).buffer,
      preview: { url: 'blob:history-preview' },
    });
    await flush();
  });

  it('renders missing, unresolvable, and preview-unavailable history fallbacks', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });
    const records = [
      buildRecord('missing-task', {
        kind: 'hostObject',
        ref: 'missing-ref',
        mimeType: 'image/png',
      }),
      buildRecord('unresolvable-task', {
        kind: 'externalToken',
        ref: 'token-ref',
        mimeType: 'image/png',
      }),
      buildRecord('unavailable-task', {
        kind: 'hostObject',
        ref: 'unavailable-ref',
        mimeType: 'image/png',
      }),
    ];

    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TestAppProviders services={fake.services}>
          <HistoryPage
            onNav={() => undefined}
            rounds={[]}
            records={records}
            loading={false}
            onReload={async () => undefined}
            onRetry={async () => undefined}
            onMiss={() => undefined}
            taskResources={{
              resolve: async (resource) => {
                switch (resource.ref.ref) {
                  case 'missing-ref':
                    return { resource, availability: 'missing' as const };
                  case 'token-ref':
                    return { resource, availability: 'unresolvable' as const };
                  default:
                    return {
                      resource,
                      availability: 'available' as const,
                      bytes: new Uint8Array([1, 2, 3]).buffer,
                    };
                }
              },
            }}
          />
        </TestAppProviders>,
      );
    });

    await click(container.querySelector('[data-testid="history-row-missing-task"]'));
    await click(container.querySelector('[data-testid="history-row-unresolvable-task"]'));
    await click(container.querySelector('[data-testid="history-row-unavailable-task"]'));
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="history-row-missing-task"] .image-fallback[data-state="file-missing"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="history-row-unresolvable-task"] .image-fallback[data-state="resource-unresolvable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="history-row-unavailable-task"] .image-fallback[data-state="preview-unavailable"]')).not.toBeNull();
  });
});

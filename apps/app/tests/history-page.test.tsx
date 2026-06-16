import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryPage } from '../src/ui/pages/history-page';
import { fakeDurableRecord } from './fakes';

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
  it('renders durable job records from application history', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <HistoryPage
          onNav={vi.fn()}
          rounds={[]}
          records={[fakeDurableRecord]}
          loading={false}
          onReload={vi.fn(async () => undefined)}
          onRetry={vi.fn(async () => undefined)}
        />,
      );
    });

    expect(container.textContent).toContain('history prompt');
    expect(container.textContent).toContain('mock-profile');
    expect(container.textContent).toContain('完成');
  });
});

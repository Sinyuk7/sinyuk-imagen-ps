import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeServices } from '../../helpers/fakes';
import { completedJob } from '../../helpers/fixtures/task.fixtures';
import {
  cleanupMainPageRoot,
  flush,
  renderMainPage,
  selectMainModel,
  sendPrompt,
} from '../../helpers/main-page-harness';

afterEach(async () => {
  await cleanupMainPageRoot();
  document.body.innerHTML = '';
});

describe('AppShell History failed action', () => {
  it('restores the failed input without retrying the original Job', async () => {
    const fake = createFakeServices();
    fake.spies.executeJob.mockImplementation(async (input) => {
      const completed = completedJob(input.execution.input, 'failed-history-job');
      const failed = {
        ...completed,
        status: 'failed' as const,
        output: undefined,
        error: { category: 'runtime' as const, message: 'forced History failure' },
      };
      await input.onJobCreated?.({
        ...failed,
        status: 'created',
        error: undefined,
        updatedAt: failed.createdAt,
      });
      return { ok: true as const, value: failed };
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container, fake);
    await selectMainModel(container);
    await sendPrompt(container, 'restore this failed prompt');

    await vi.waitFor(() => {
      expect(container.textContent).toContain('forced History failure');
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-history-button"]')?.click();
    });
    await flush();
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid^="history-retry-button-"]')).not.toBeNull();
    });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid^="history-retry-button-"]')?.click();
    });
    await flush();

    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')?.value)
      .toBe('restore this failed prompt');
    expect(fake.spies.executeJob).toHaveBeenCalledTimes(1);
  });
});

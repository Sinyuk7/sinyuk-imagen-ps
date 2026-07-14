import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { changeTextarea, cleanupMainPageRoot, flush, renderMainPage, sendPrompt } from '../../../helpers/main-page-harness';
import { createFakeServices } from '../../../helpers/fakes';

afterEach(async () => {
  await cleanupMainPageRoot();
  document.body.innerHTML = '';
});

describe('MainPage session queue', () => {
  it('keeps the composer available and removes queued-only work before dispatch', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });
    const submitJob = vi.spyOn(fake.services.commands, 'submitJob').mockImplementation(() => new Promise(() => undefined));
    await renderMainPage(container, fake);

    await sendPrompt(container, 'first queued task');
    await sendPrompt(container, 'second queued task');
    await sendPrompt(container, 'third queued task');

    expect(submitJob).toHaveBeenCalledTimes(2);
    expect(fake.spies.putTaskRecord).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll('div[data-testid^="queued-task-"]')).toHaveLength(3);
    expect(container.textContent).toContain('排队中 · #3');
    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')!, 'fourth task');
    });
    await flush();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="composer-send-button"]')?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="composer-capture-button"]')?.disabled).toBe(false);

    const remove = container.querySelector<HTMLButtonElement>('[data-testid^="queued-task-remove-"]');
    expect(remove).not.toBeNull();
    await act(async () => remove!.click());
    await flush();

    expect(container.querySelectorAll('div[data-testid^="queued-task-"]')).toHaveLength(2);
    expect(submitJob).toHaveBeenCalledTimes(2);
    expect(fake.spies.putTaskRecord).toHaveBeenCalledTimes(2);
  });
});

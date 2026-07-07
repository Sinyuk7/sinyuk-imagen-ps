import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupMainPageRoot, flush, renderMainPage, sendPrompt } from '../../../helpers/main-page-harness';
import { createFakeServices } from '../../../helpers/fakes';

async function renderReadyMain(container: HTMLElement) {
  const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });
  await renderMainPage(container, fake);
  await flush();
  await flush();
  return fake;
}

function mockOverflowMetrics(promptBody: HTMLElement, promptText: HTMLElement): void {
  Object.defineProperty(promptBody, 'clientHeight', {
    configurable: true,
    value: 54,
  });
  Object.defineProperty(promptText, 'scrollHeight', {
    configurable: true,
    value: 126,
  });
  Object.defineProperty(promptText, 'offsetHeight', {
    configurable: true,
    value: 126,
  });
}

describe('MainPage prompt folding', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('shows explicit expand/collapse controls for overflowing user prompts', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderReadyMain(container);

    const longPrompt = [
      'Keep composition unchanged.',
      'Refine face texture and preserve lighting direction.',
      'Remove blemishes and patchy shadows naturally.',
      'Increase resolution without crunchy sharpening.',
      'Retain halo shape and background brightness.',
      'Do not change framing or crop.',
    ].join('\n');

    await sendPrompt(container, longPrompt);

    const promptShell = container.querySelector<HTMLElement>('[data-testid^="user-prompt-shell-"]');
    const promptBody = container.querySelector<HTMLElement>('[data-testid^="user-prompt-body-"]');
    const promptText = container.querySelector<HTMLElement>('[data-testid^="user-prompt-text-"]');
    expect(promptShell).not.toBeNull();
    expect(promptBody).not.toBeNull();
    expect(promptText).not.toBeNull();

    mockOverflowMetrics(promptBody!, promptText!);

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    await flush();

    const toggle = container.querySelector<HTMLButtonElement>('[data-testid^="user-prompt-toggle-"]');
    expect(toggle?.textContent).toContain('展开提示词');
    expect(promptShell?.dataset.expanded).toBeUndefined();
    expect(promptShell?.dataset.overflowing).toBe('true');

    await act(async () => {
      toggle?.click();
    });
    await flush();

    expect(promptShell?.dataset.expanded).toBe('true');
    expect(toggle?.textContent).toContain('收起提示词');

    await act(async () => {
      toggle?.click();
    });
    await flush();

    expect(promptShell?.dataset.expanded).toBeUndefined();
    expect(toggle?.textContent).toContain('展开提示词');
  });
});

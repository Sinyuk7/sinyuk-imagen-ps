import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupMainPageRoot, flush, renderMainPage } from '../../../helpers/main-page-harness';
import { createFakeServices } from '../../../helpers/fakes';

function optionLabels(testId: string): readonly string[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid^="${testId}-option-"]`))
    .map((element) => element.textContent?.trim() ?? '');
}

async function openSelect(container: HTMLElement, testId: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click();
  });
  await flush();
}

async function renderReadyMain(container: HTMLElement) {
  const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });
  await renderMainPage(container, fake);
  await flush();
  await flush();
  return fake;
}

describe('generation settings UI archetypes', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('renders GPT flexible-pixels controls on MainPage without aspect ratio in text-to-image', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderReadyMain(container);

    expect(container.querySelector('[data-testid="composer-output-size-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="composer-output-format-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="composer-output-ratio-selector"]')).toBeNull();

    await openSelect(container, 'composer-output-size-selector');
    expect(optionLabels('composer-output-size-selector')).toEqual(['Auto', '1K', '2K', '4K']);
  });

  it('prepends Use Input Size on MainPage for image edit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderReadyMain(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')?.click();
    });
    await flush();
    await flush();

    await openSelect(container, 'composer-output-size-selector');
    expect(optionLabels('composer-output-size-selector')).toEqual(['Use Input Size', 'Auto', '1K', '2K', '4K']);
  });

  it('uses same archetype rules on GlobalGenerationSettingsPage', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderReadyMain(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-providers-button"]')?.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-generation-settings-row"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="global-output-size-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="global-output-format-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="global-aspect-ratio-selector"]')).toBeNull();

    await openSelect(container, 'global-output-size-selector');
    expect(optionLabels('global-output-size-selector')).toEqual(['Auto', '1K', '2K', '4K']);
    expect(container.textContent).toContain('Use Input Size 使用归一化后的第一张输入图尺寸。');
  });
});

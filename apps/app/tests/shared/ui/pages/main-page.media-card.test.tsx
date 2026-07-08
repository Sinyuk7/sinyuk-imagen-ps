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

describe('MainPage media result card', () => {
  afterEach(async () => {
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('splits response text and media preview into separate cards', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderReadyMain(container);

    await sendPrompt(container, 'Generate square preview and explain result.');
    await flush();
    await flush();

    const responseCard = container.querySelector<HTMLElement>('[data-testid^="result-response-card-"]');
    const mediaCard = container.querySelector<HTMLElement>('[data-testid^="result-media-card-"]');
    const responseText = container.querySelector<HTMLElement>('[data-testid^="result-response-text-"]');
    const mediaHeader = mediaCard?.querySelector<HTMLElement>('.prov-media-header');
    const mediaSection = mediaCard?.querySelector<HTMLElement>('.prov-media-section');
    const preview = mediaCard?.querySelector<HTMLElement>('[data-testid^="result-preview-"]');
    const stage = mediaCard?.querySelector<HTMLElement>('.img-stage');
    const frame = mediaCard?.querySelector<HTMLElement>('.img-frame');
    const providerRow = mediaCard?.querySelector<HTMLElement>('.prov-media-provider-row');
    const metaRow = mediaCard?.querySelector<HTMLElement>('.prov-media-meta-row');
    const modelName = mediaCard?.querySelector<HTMLElement>('.prov-media-model-name');
    const statusGroup = mediaCard?.querySelector<HTMLElement>('.prov-media-status-group');

    expect(responseCard).not.toBeNull();
    expect(mediaCard).not.toBeNull();
    expect(responseText?.closest('[data-testid^="result-response-card-"]')).toBe(responseCard);
    expect(mediaCard?.querySelector('.prov-response')).toBeNull();
    expect(mediaCard?.dataset.mediaCardKind).toBe('square');
    expect(mediaCard?.style.width).toBe('var(--chat-preview-block-fallback)');
    expect(mediaHeader).not.toBeNull();
    expect(mediaSection).not.toBeNull();
    expect(preview?.getAttribute('data-preview-layout')).toBe('intrinsic');
    expect(preview?.getAttribute('data-preview-visual-mode')).toBe('full-bleed');
    expect(stage).not.toBeNull();
    expect(frame).not.toBeNull();
    expect(providerRow?.textContent?.trim().length).toBeGreaterThan(0);
    expect(metaRow).not.toBeNull();
    expect(modelName?.textContent?.trim().length).toBeGreaterThan(0);
    expect(statusGroup?.textContent).toContain('完成');
    expect(mediaCard?.querySelector('.prov-top')).toBeNull();
    expect(mediaCard?.querySelector('.prov-status')).toBeNull();
  });
});

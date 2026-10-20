import { expect, test } from '@playwright/test';

async function openComposer(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?testHarness=1&resetStorage=1');
  await expect(page.getByTestId('composer-textarea')).toBeVisible();
  await expect(page.getByTestId('composer-settings-toggle')).toBeVisible();
}

async function setSpectrumValue(locator: import('@playwright/test').Locator, value: string): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    (element as HTMLElement & { value: string }).value = nextValue;
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }, value);
}

test('settings summary is stable, described, hoverable, focusable, and hidden while expanded', async ({ page }) => {
  await openComposer(page);
  await expect(page.getByTestId('composer-attachments')).toHaveCount(0);
  await expect(page.getByTestId('composer-toolbar')).toHaveCount(0);
  await expect(page.getByTestId('composer-add-image-button')).toHaveAttribute('aria-label', '添加图片');
  await expect(page.getByTestId('composer-mask-toggle')).toHaveAttribute('aria-label', '蒙版：关闭');
  await expect(page.getByTestId('composer-capture-button')).toHaveAttribute('aria-label', '捕获当前 Photoshop 图层或选区');

  const settings = page.getByTestId('composer-settings-toggle');
  await expect(settings).toHaveAttribute('aria-label', '生成设置');
  await expect(settings).toHaveAccessibleName('生成设置');
  const runButton = page.getByTestId('composer-send-button');
  await expect(runButton).toHaveAttribute('aria-description', /.+/);
  await expect(runButton).toHaveAccessibleDescription(/.+/);
  await runButton.focus();
  await expect(runButton).toBeFocused();
  const tooltip = page.getByTestId('composer-settings-toggle-tooltip');
  await expect(tooltip).toHaveCount(1);
  const describedBy = await settings.getAttribute('aria-describedby');
  expect(describedBy).toBe(await tooltip.getAttribute('id'));
  await expect(tooltip).toContainText('模型:');
  await expect(tooltip).toContainText('模板:');
  await expect(tooltip.locator('.ui-tooltip-line')).toHaveCount(4);

  await settings.hover();
  await expect.poll(() => tooltip.evaluate((element) => getComputedStyle(element).display)).toBe('block');
  const tooltipLayers = await page.evaluate(() => ({
    toolbar: Number.parseInt(getComputedStyle(document.querySelector('.cmp-action-row')!).zIndex, 10),
    prompt: Number.parseInt(getComputedStyle(document.querySelector('.cmp-body')!).zIndex, 10),
  }));
  expect(tooltipLayers.toolbar).toBeGreaterThan(tooltipLayers.prompt);
  await page.mouse.move(2, 2);
  await expect.poll(() => tooltip.evaluate((element) => getComputedStyle(element).display)).toBe('none');

  await settings.focus();
  await expect.poll(() => tooltip.evaluate((element) => getComputedStyle(element).display)).toBe('block');
  await settings.press('Tab');
  await expect.poll(() => tooltip.evaluate((element) => getComputedStyle(element).display)).toBe('none');
  await settings.focus();
  await settings.click();
  await expect(page.getByTestId('composer-toolbar')).toBeVisible();
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await expect(settings).toHaveAttribute('selected', '');
  await expect(tooltip).toHaveCount(0);
  await expect(settings).toHaveAttribute('aria-label', '生成设置');
  await settings.click();
  await expect(page.getByTestId('composer-toolbar')).toHaveCount(0);

  await settings.click();
  await page.getByTestId('composer-ratio-selector').click();
  await page.getByTestId('composer-ratio-selector-option-1:1').click();
  await settings.click();
  await expect(page.getByTestId('composer-settings-toggle-tooltip')).toContainText('比例: 1:1');
});

test('settings summary updates to the selected prompt template name', async ({ page }) => {
  const templateName = 'Selected template with a deliberately long display name';
  await openComposer(page);
  await page.getByTestId('main-providers-button').click();
  await page.getByTestId('settings-backend-general').click();
  await page.getByTestId('prompt-settings-row').click();
  await page.getByTestId('prompt-template-add').click();
  await expect(page.getByTestId('prompt-template-save')).toBeVisible();
  await setSpectrumValue(page.locator('#prompt-template-name'), templateName);
  await setSpectrumValue(page.locator('#prompt-template-user'), 'Edit with this instruction: {prompt}');
  await page.getByTestId('prompt-template-save').click();
  await expect(page.getByText(templateName)).toBeVisible();

  await page.getByRole('button', { name: '返回' }).click();
  await page.getByTestId('settings-back-button').click();
  const summary = page.getByTestId('composer-settings-toggle-tooltip');
  const truncatedName = `${Array.from(templateName).slice(0, 19).join('')}…`;
  await expect(summary).toContainText(`模板: ${truncatedName}`);
});

test('prompt template can be disabled and the home selector displays None', async ({ page }) => {
  await openComposer(page);
  await page.getByTestId('composer-settings-toggle').click();
  const selector = page.getByTestId('composer-prompt-template-selector');
  await expect(selector).toHaveAttribute('aria-label', /None/u);
  await selector.click();
  await page.getByRole('option', { name: 'Default' }).click();
  await expect(selector).toHaveAttribute('aria-label', /Default/u);
  await selector.click();
  await page.getByRole('option', { name: 'None' }).click();
  await expect(selector).toHaveAttribute('aria-label', /None/u);
  await page.getByTestId('composer-settings-toggle').click();
  await expect(page.getByTestId('composer-settings-toggle-tooltip')).toContainText('模板: None');
});

test('deleting the selected final prompt template leaves an empty list and returns home to None', async ({ page }) => {
  await openComposer(page);
  await page.getByTestId('composer-settings-toggle').click();
  const selector = page.getByTestId('composer-prompt-template-selector');
  await selector.click();
  await page.getByRole('option', { name: 'Default' }).click();

  await page.getByTestId('main-providers-button').click();
  await page.getByTestId('settings-backend-general').click();
  await page.getByTestId('prompt-settings-row').click();
  const templateRow = page.locator('.prompt-template-row').filter({ hasText: 'Default' });
  await expect(templateRow).toBeVisible();
  await templateRow.getByRole('button', { name: '删除' }).click();
  await expect(page.locator('.prompt-template-row')).toHaveCount(0);

  await page.goto('/?testHarness=1');
  await expect(page.getByTestId('composer-settings-toggle')).toBeVisible();
  await page.getByTestId('composer-settings-toggle').click();
  await expect(page.getByTestId('composer-prompt-template-selector')).toHaveAttribute('aria-label', /None/u);
  await expect(page.getByTestId('composer-prompt-template-selector')).toHaveAttribute('data-selected-id', '__none__');
});

test('attachments add a uniform strip without changing the action row', async ({ page }) => {
  await openComposer(page);
  const actionControls = ['composer-add-image-button', 'composer-mask-toggle', 'composer-capture-button', 'composer-settings-toggle', 'composer-send-button'];
  for (const testId of actionControls) await expect(page.getByTestId(testId)).toBeVisible();
  await expect(page.getByTestId('composer-attachments')).toHaveCount(0);

  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-ps-layers-option').click();
  const layer = page.getByTestId(/^layer-row-/).first();
  await expect(layer).toBeVisible();
  await layer.click();

  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-ps-layers-option').click();
  const secondLayer = page.getByTestId(/^layer-row-/).nth(1);
  await expect(secondLayer).toBeVisible();
  await secondLayer.click();

  const attachments = page.getByTestId('composer-attachments');
  await expect(attachments).toBeVisible();
  const items = [attachments.getByTestId(/^composer-attachment-item-/).nth(0), attachments.getByTestId(/^composer-attachment-item-/).nth(1)];
  await expect(items[0]).toBeVisible();
  await expect(items[1]).toBeVisible();
  await expect(items[0].getByTestId(/^composer-attachment-preview-/)).toBeVisible();
  const firstName = items[0].getByTestId(/^composer-attachment-name-/);
  await expect(firstName).toBeVisible();
  await expect(items[0]).toHaveCSS('flex-basis', '148px');
  const itemWidths = await Promise.all(items.map((item) => item.evaluate((element) => (element as HTMLElement).getBoundingClientRect().width)));
  expect(itemWidths[0]).toBe(itemWidths[1]);
  await firstName.evaluate((element) => {
    (element as HTMLElement).textContent = 'A deliberately long attachment title that must be truncated';
  });
  await expect(firstName).toHaveCSS('text-overflow', 'ellipsis');
  const titleOverflow = await firstName.evaluate((element) => {
    const node = element as HTMLElement;
    return node.scrollWidth > node.clientWidth;
  });
  expect(titleOverflow).toBe(true);
  for (const testId of actionControls) await expect(page.getByTestId(testId)).toBeVisible();

  await items[0].getByTestId(/^attachment-remove-button-/).click();
  await expect(attachments.getByTestId(/^composer-attachment-item-/)).toHaveCount(1);
  await attachments.getByTestId(/^composer-attachment-item-/).getByTestId(/^attachment-remove-button-/).click();
  await expect(page.getByTestId('composer-attachments')).toHaveCount(0);
});

test('mask acquisition errors retain the retry action after a failed retry', async ({ page }) => {
  await page.goto('/?testHarness=1&scenario=mask-read-failure&resetStorage=1');
  await page.getByTestId('main-provider-selector').click();
  await page.getByTestId('main-mode-comfyui').click();
  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-ps-layers-option').click();
  await page.getByTestId(/^layer-row-/).first().click();
  const maskToggle = page.getByTestId('composer-mask-toggle');
  await expect(maskToggle).toBeEnabled();
  await maskToggle.click();
  const maskStatus = page.getByTestId('composer-mask-status');
  await expect(maskStatus).toHaveAttribute('data-state', 'error');
  const retry = page.getByTestId('composer-mask-retry');
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(maskStatus).toHaveAttribute('data-state', 'error');
  await expect(retry).toBeVisible();
});

test('mask acquisition success leaves the requested mask state enabled', async ({ page }) => {
  await page.goto('/?testHarness=1&scenario=mask-capable-layer&resetStorage=1');
  await page.getByTestId('main-provider-selector').click();
  await page.getByTestId('main-mode-comfyui').click();
  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-ps-layers-option').click();
  await page.getByTestId(/^layer-row-/).first().click();

  const maskToggle = page.getByTestId('composer-mask-toggle');
  await expect(maskToggle).toBeEnabled();
  await maskToggle.click();
  await expect(maskToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('composer-mask-status')).toHaveCount(0);
});

test('ordinary Enter inserts a newline while the platform shortcut reaches readiness feedback', async ({ page }) => {
  // Chrome 没有 Photoshop 提供的 sp-textarea；用原生 textarea 替身真实验证键盘编辑行为。
  // React 仍绑定在 sp-textarea 宿主上，事件和 value/selection 属性经轻量代理向上转发。
  await page.addInitScript(() => {
    if (customElements.get('sp-textarea')) return;
    customElements.define('sp-textarea', class extends HTMLElement {
      private editor?: HTMLTextAreaElement;

      connectedCallback(): void {
        if (this.editor) return;
        this.editor = document.createElement('textarea');
        this.editor.style.cssText = 'box-sizing:border-box;width:100%;height:100%;resize:none;background:transparent;color:inherit;border:0;outline:0;font:inherit';
        this.editor.setAttribute('aria-label', this.getAttribute('placeholder') ?? '提示词');
        this.append(this.editor);
        this.editor.value = this.getAttribute('value') ?? '';
      }

      get value(): string { return this.editor?.value ?? ''; }
      set value(value: string) { if (this.editor) this.editor.value = value; }
      get selectionStart(): number { return this.editor?.selectionStart ?? 0; }
      get selectionEnd(): number { return this.editor?.selectionEnd ?? 0; }
      get readOnly(): boolean { return this.editor?.readOnly ?? false; }
      get disabled(): boolean { return this.editor?.disabled ?? false; }
      focus(): void { this.editor?.focus(); }
      blur(): void { this.editor?.blur(); }
    });
  });
  await page.goto('/?testHarness=1&resetStorage=1');
  const prompt = page.getByTestId('composer-textarea').locator('textarea');
  await expect(prompt).toBeVisible();
  await prompt.fill('first line');
  await prompt.press('Enter');
  await expect(prompt).toHaveValue('first line\n');
  await prompt.fill('');
  await expect(page.getByTestId('toast')).toHaveCount(0);

  const runButton = page.getByTestId('composer-send-button');
  await expect(runButton).toHaveAttribute('aria-disabled', '');
  await expect(runButton).toHaveAccessibleDescription(/请输入提示词/);
  await runButton.focus();
  await expect(runButton).toBeFocused();

  const platform = await page.evaluate(() => `${navigator.platform} ${navigator.userAgent}`);
  const shortcutPrevented = await prompt.evaluate((element, isMac) => element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true, cancelable: true, composed: true,
    metaKey: isMac, ctrlKey: !isMac,
  })) === false, /mac|iphone|ipad|ipod/iu.test(platform));
  expect(shortcutPrevented).toBe(true);
  await expect(page.getByTestId('toast')).toContainText('请输入提示词');
});

test('Photoshop capture keeps its attachment feedback and reports host failures', async ({ page }) => {
  await page.goto('/?testHarness=1&resetStorage=1');
  await expect(page.getByTestId('composer-capture-button')).toBeEnabled();
  await page.getByTestId('composer-capture-button').click();
  await expect(page.getByTestId('toast')).toContainText('已添加捕获');
  await expect(page.getByTestId('composer-attachments')).toBeVisible();
  await expect(page.getByTestId('composer-capture-button')).toHaveAttribute('aria-busy', 'false');

  await page.goto('/?testHarness=1&scenario=host-busy&resetStorage=1');
  await expect(page.getByTestId('composer-capture-button')).toBeEnabled();
  await page.getByTestId('composer-capture-button').click();
  await expect(page.getByTestId('toast')).toContainText('Simulator host is busy.');
  await expect(page.getByTestId('composer-capture-button')).toHaveAttribute('aria-busy', 'false');
});

test('composer layout keeps the left and right actions separated at supported widths', async ({ page }) => {
  await openComposer(page);
  const sizes = [
    { width: 320, height: 720, mode: 'compact' },
    { width: 360, height: 600, mode: 'regular' },
    { width: 420, height: 680, mode: 'regular' },
    { width: 1280, height: 800, mode: 'wide' },
  ];
  const settings = page.getByTestId('composer-settings-toggle');
  for (const { width, height, mode } of sizes) {
    await page.setViewportSize({ width, height });
    await expect(page.getByTestId('app-panel')).toHaveAttribute('data-panel-width-mode', mode);
    const left = page.getByTestId('composer-action-left');
    const right = page.getByTestId('composer-action-right');
    const leftBox = await left.boundingBox();
    const rightBox = await right.boundingBox();
    expect(leftBox).not.toBeNull();
    expect(rightBox).not.toBeNull();
    expect(leftBox!.x + leftBox!.width).toBeLessThanOrEqual(rightBox!.x + 2);
    await expect(settings).toBeVisible();
    await expect(page.getByTestId('composer-send-button')).toBeVisible();
    await settings.hover();
    const tooltip = page.getByTestId('composer-settings-toggle-tooltip');
    await expect.poll(() => tooltip.evaluate((element) => getComputedStyle(element).display)).toBe('block');
    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();
    expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(width + 1);
    await page.mouse.move(2, 2);
    await settings.click();
    const toolbar = page.getByTestId('composer-toolbar');
    await expect(toolbar).toBeVisible();
    const toolbarWidth = await toolbar.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(toolbarWidth.scroll).toBeLessThanOrEqual(toolbarWidth.client + 1);
    await settings.click();
  }
});

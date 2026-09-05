import { expect, test, type Page } from '@playwright/test';

const sizes = [
  { name: '300x420', width: 300, height: 420 },
  { name: '420x680', width: 420, height: 680 },
] as const;

test.beforeEach(async ({ browser }) => {
  test.skip(process.platform !== 'darwin', 'Visual baselines are accepted only on macOS.');
  test.skip(browser.version() !== '149.0.7827.55', 'Visual baselines require the accepted Chromium revision.');
});

async function openMain(page: Page) {
  await page.goto('/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=mask-capable-layer');
  await expect(page.getByTestId('composer-send-button')).toBeVisible();
  await expect(page.locator('[data-primary-scroll="true"]')).toHaveCount(1);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.locator('#root').evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
}

async function expectTextAreaFillsShell(page: Page) {
  await expect.poll(() => page.locator('.cmp-ta-shell').evaluate((shell) => {
    const editor = shell.querySelector('.cmp-ta');
    if (!editor) return false;
    const shellRect = shell.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    return editorRect.height >= shellRect.height - 1 && editorRect.width >= shellRect.width - 1;
  })).toBe(true);
}

for (const size of sizes) {
  test(`main composer ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openMain(page);
    await expectNoHorizontalOverflow(page);
    await expectTextAreaFillsShell(page);
    await expect(page.locator('#root')).toHaveScreenshot(`main-composer-${size.name}.png`);
  });

  test(`main attachment composer ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openMain(page);
    await page.getByTestId('composer-add-image-button').click();
    await page.getByTestId('attach-ps-layers-option').click();
    await page.getByTestId('layer-row-1').click();
    await expect(page.locator('.att-thumb')).toBeVisible();
    await expect(page.getByTestId('composer-mask-toggle')).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByTestId('toast')).toBeHidden();
    await expect(page.locator('#root')).toHaveScreenshot(`main-attachment-composer-${size.name}.png`);
  });

  test(`main opened selectors ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openMain(page);
    await page.getByTestId('main-profile-selector').click();
    await expect(page.getByTestId('profile-menu-option-mock-profile')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#root')).toHaveScreenshot(`main-profile-selector-open-${size.name}.png`);

    await page.getByTestId('profile-menu-option-mock-profile').click();
    await page.getByTestId('composer-output-size-selector').click();
    await expect(page.getByTestId('composer-output-size-selector-menu')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#root')).toHaveScreenshot(`main-output-selector-open-${size.name}.png`);
  });
}

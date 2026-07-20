import { expect, test } from '@playwright/test';

const sizes = [
  { name: '300x420', width: 300, height: 420 },
  { name: '360x600', width: 360, height: 600 },
  { name: '420x680', width: 420, height: 680 },
  { name: '520x720', width: 520, height: 720 },
] as const;

test.beforeEach(async ({ page, browser }) => {
  test.skip(process.platform !== 'darwin', 'Visual baselines are accepted only on macOS.');
  test.skip(browser.version() !== '149.0.7827.55', 'Visual baselines require the accepted Chromium revision.');
  await page.goto('/index.html?harness=ui-catalog');
  await expect(page.locator('[data-visual-ready="true"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(1);
  await expect.poll(() => page.evaluate(() => document.fonts.check('12px -apple-system'))).toBe(true);
});

for (const size of sizes) {
  test(`catalog ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expect.poll(() => page.locator('[data-visual-ready="true"]').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.locator('[data-visual-ready="true"]')).toHaveScreenshot(`ui-catalog-${size.name}.png`);
  });
}

test('catalog preserves critical role and state contracts', async ({ page }) => {
  const tabs = page.locator('[role="tab"]');
  await expect(page.locator('[role="tablist"]')).toBeVisible();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toBeDisabled();
  await expect(page.locator('[data-primary-scroll="true"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'UI Catalog' })).toBeVisible();
});

test('catalog renders localized light and high-contrast fixtures', async ({ page }) => {
  await page.goto('/index.html?harness=ui-catalog&theme=light&locale=zh-CN');
  await expect(page.locator('[data-visual-ready="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '界面目录' })).toBeVisible();
  await expect(page.locator('[data-visual-ready="true"]')).toHaveScreenshot('ui-catalog-light-zh.png');
  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/index.html?harness=ui-catalog&theme=high-contrast&locale=en');
  await expect(page.locator('[data-visual-ready="true"]')).toHaveScreenshot('ui-catalog-high-contrast-en.png');
});

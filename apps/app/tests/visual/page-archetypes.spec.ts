import { expect, test, type Page } from '@playwright/test';

const sizes = [
  { name: '300x420', width: 300, height: 420 },
  { name: '360x600', width: 360, height: 600 },
  { name: '420x680', width: 420, height: 680 },
  { name: '520x720', width: 520, height: 720 },
] as const;

const providerSurfaceSizes = [sizes[0], sizes[3]] as const;

test.beforeEach(async ({ browser }) => {
  test.skip(process.platform !== 'darwin', 'Visual baselines are accepted only on macOS.');
  test.skip(browser.version() !== '149.0.7827.55', 'Visual baselines require the accepted Chromium revision.');
});

async function openSettings(page: Page) {
  await page.goto('/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document');
  await page.getByTestId('main-providers-button').click();
  await expect(page.getByTestId('settings-backend-provider')).toBeVisible();
}

for (const size of sizes) {
  test(`settings list ${size.name}`, async ({ page }) => {
    test.skip(process.platform !== 'darwin', 'Visual baselines are accepted only on macOS.');
    await page.setViewportSize({ width: size.width, height: size.height });
    await openSettings(page);
    await expect(page.locator('[data-primary-scroll="true"]')).toHaveCount(1);
    await expect(page.getByTestId('settings-backend-provider')).toHaveScreenshot(`settings-list-${size.name}.png`);
  });

  test(`settings form ${size.name}`, async ({ page }) => {
    test.skip(process.platform !== 'darwin', 'Visual baselines are accepted only on macOS.');
    await page.setViewportSize({ width: size.width, height: size.height });
    await openSettings(page);
    await page.getByTestId('settings-backend-comfyui').click();
    await expect(page.getByTestId('comfyui-settings-root')).toBeVisible();
    await expect(page.getByTestId('comfyui-settings-root')).toHaveScreenshot(`settings-form-${size.name}.png`);
  });

  test(`settings state ${size.name}`, async ({ page }) => {
    test.skip(process.platform !== 'darwin', 'Visual baselines are accepted only on macOS.');
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/index.html?testHarness=1&storage=memory&scenario=seeded-document');
    await page.getByTestId('main-providers-button').click();
    await expect(page.getByTestId('provider-empty-state')).toBeVisible();
    await expect(page.getByTestId('provider-empty-state')).toHaveScreenshot(`settings-state-${size.name}.png`);
  });
}

for (const size of providerSurfaceSizes) {
  test(`provider picker ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openSettings(page);
    await page.getByTestId('providers-add-button').click();
    await expect(page.getByTestId('provider-picker-gemini')).toBeVisible();
    await expect(page.locator('.ui-page-frame')).toHaveScreenshot(`provider-picker-${size.name}.png`);
  });

  test(`provider profile ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openSettings(page);
    await page.getByTestId('providers-add-button').click();
    await page.getByTestId('provider-picker-gemini').click();
    await expect(page.getByTestId('provider-profile-form')).toBeVisible();
    await expect(page.locator('.ui-page-frame')).toHaveScreenshot(`provider-profile-${size.name}.png`);
  });
}

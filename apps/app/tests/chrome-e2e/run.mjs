import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const testRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const appRoot = resolve(testRoot, '../..');
const repoRoot = resolve(appRoot, '../..');
const webRoot = resolve(appRoot, 'dist/web');
const defaultViewport = { width: 390, height: 720, deviceScaleFactor: 1 };
const keepScreenshots = process.env.KEEP_SCREENSHOTS === '1';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactRoot = resolve(testRoot, 'screenshots', runId);
const failuresRoot = resolve(artifactRoot, 'failures');

function parseGrep(argv) {
  const index = argv.indexOf('--grep');
  if (index >= 0) {
    return argv[index + 1] ?? '';
  }
  const inline = argv.find((arg) => arg.startsWith('--grep='));
  return inline ? inline.slice('--grep='.length) : '';
}

function sanitizeFailureReason(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith('Call log:'))
    ?.replace(/\\/g, '/')
    .replace(/"/g, "'")
    .slice(0, 240) ?? 'Scenario failed.';
}

function relativeFromApp(path) {
  return relative(appRoot, path).split(sep).join('/');
}

function runBuild() {
  const result = spawnSync('pnpm', ['run', 'build:chrome'], {
    cwd: appRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Chrome build failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

function createStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const rawPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = resolve(webRoot, `.${rawPath}`);
      if (!filePath.startsWith(`${webRoot}${sep}`) && filePath !== webRoot) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { 'content-type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Static server did not expose a TCP address.'));
        return;
      }
      resolveServer({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      });
    });
  });
}

async function expectVisibleText(page, text) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 });
}

async function assertNoBrokenImages(page) {
  const broken = await page.locator('img').evaluateAll((images) => images
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.getAttribute('src') ?? image.getAttribute('alt') ?? 'unknown image'));
  if (broken.length > 0) {
    throw new Error(`Broken image elements: ${broken.join(', ')}`);
  }
}

async function checkpoint(page, capture, screenshotName, assertion) {
  await assertion?.();
  await capture(screenshotName);
}

async function fillUxp(locator, value) {
  const tagName = await locator.evaluate((element) => element.tagName.toLowerCase());
  if (tagName === 'sp-textfield') {
    await locator.click();
    await locator.evaluate((element, nextValue) => {
      element.value = nextValue;
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }, value);
    await locator.evaluate((element) => element.dispatchEvent(new FocusEvent('blur', { bubbles: true })));
    return;
  }
  await locator.click();
  await locator.fill(value);
  await locator.press('Tab');
}

function normalizeAppUrl(url) {
  return url.replace('/index.html?', '/?');
}

async function expectControlProperty(locator, property, expectedValue, label) {
  await locator.evaluate((element, expectation) => {
    const actualValue = element?.[expectation.property];
    if (actualValue !== expectation.expectedValue) {
      throw new Error(
        `${expectation.label}: expected ${expectation.property}=${JSON.stringify(expectation.expectedValue)}, got ${JSON.stringify(actualValue)} on <${element.tagName.toLowerCase()}>.`,
      );
    }
  }, { property, expectedValue, label });
}

async function expectControlDisabled(locator, label) {
  const disabled = await locator.evaluate((control) => Boolean(control.disabled));
  if (!disabled) {
    throw new Error(`${label} was not disabled while pending.`);
  }
}

async function expectNoVisibleSecret(page) {
  const text = await page.locator('body').innerText();
  if (text.includes('mock-key')) {
    throw new Error('Raw mock-key appeared in visible UI text.');
  }
}

async function expectSavedSecretPlaceholder(page) {
  await expectControlProperty(
    page.getByTestId('provider-api-key-input'),
    'placeholder',
    'Saved; leave blank to keep unchanged',
    'Saved secret placeholder mismatch',
  );
}

async function openApp(page, url) {
  await page.goto(normalizeAppUrl(url), { waitUntil: 'networkidle' });
  await page.locator('#root[data-runtime="chrome"][data-status="ok"]').waitFor({ timeout: 10000 });
}

async function openAddProviderStep2(page, url) {
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  await expectVisibleText(page, 'Providers');
  await page.getByTestId('providers-add-button').click();
  await expectVisibleText(page, 'Add Provider');
  await page.getByTestId('provider-type-mock').click();
  await expectVisibleText(page, 'Mock Provider');
  await expectVisibleText(page, '2 / 2');
}

async function fillMockProviderDraft(page, alias) {
  await fillUxp(page.getByTestId('provider-alias-input'), alias);
  await fillUxp(page.getByTestId('provider-base-url-input'), 'https://mock.local');
  await fillUxp(page.getByTestId('provider-default-model-input'), 'mock-image-v1');
  await fillUxp(page.getByTestId('provider-api-key-input'), 'mock-key');
}

async function submitPrompt(page, prompt) {
  await fillUxp(page.getByTestId('composer-textarea'), prompt);
  await page.getByTestId('composer-send-button').evaluate((button) => {
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error('Send button did not become enabled before submit.');
    }
  });
  await page.getByTestId('composer-send-button').click();
}

async function waitForDoneResult(page) {
  await page.getByText('Done').first().waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.prov-img img').first().waitFor({ state: 'visible', timeout: 5000 });
}

async function addFileAttachment(page) {
  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-upload-option').click();
  await expectVisibleText(page, 'Image added');
  await page.locator('.att-thumb').first().waitFor({ state: 'visible', timeout: 5000 });
}

async function addLayerAttachment(page) {
  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-ps-layers-option').click();
  await page.getByTestId('layer-row-1').click();
  await expectVisibleText(page, 'Layer added');
  await page.locator('.att-thumb').first().waitFor({ state: 'visible', timeout: 5000 });
}

async function smokeScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'No provider profile');
  await expectVisibleText(page, 'No model selected');
  await expectVisibleText(page, 'Current session');
  await expectVisibleText(page, 'What would you like to create? Pick a profile, describe your image, and send.');
  await expectVisibleText(page, 'Product photo of a blue glass perfume bottle');
  await expectVisibleText(page, 'Cyberpunk night reference edit');
  await expectVisibleText(page, 'Generate around the current PS layer');
  await page.locator('textarea[placeholder="Add a profile in Providers first"]').waitFor({ state: 'visible' });
  await page.locator('button.cmp-send').evaluate((button) => {
    if (!(button instanceof HTMLButtonElement) || !button.disabled) {
      throw new Error('Send button is not disabled in first-run smoke state.');
    }
  });
  await assertNoBrokenImages(page);
  await capture('00-smoke-main-empty.png');
}

async function harnessScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await expectVisibleText(page, 'mock-image-v1');
  const snapshot = await page.evaluate(async () => globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.snapshot());
  if (!snapshot) {
    throw new Error('Chrome test harness global is missing.');
  }
  if (snapshot.profiles[0]?.profileId !== 'mock-profile') {
    throw new Error(`Unexpected seeded profile snapshot: ${JSON.stringify(snapshot.profiles)}`);
  }
  if (snapshot.history.length !== 3) {
    throw new Error(`Unexpected seeded history count: ${snapshot.history.length}`);
  }
  await page.evaluate(async () => {
    await globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.setMockFailureMode('always');
    globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.setFilePickerMode('cancel');
  });
  const updated = await page.evaluate(async () => globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.snapshot());
  if (updated?.profiles[0]?.config.failMode === undefined) {
    throw new Error('Mock failure mode was not applied to the seeded profile.');
  }
  if (updated.filePickerMode !== 'cancel') {
    throw new Error(`Unexpected file picker mode: ${updated.filePickerMode}`);
  }
  await assertNoBrokenImages(page);
  await capture('01-harness-seeded-profile.png');
}

async function firstRunProviderNavigationScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('main-profile-selector').click();
  await checkpoint(page, capture, '01-profile-dropdown-empty.png', async () => {
    await expectVisibleText(page, 'Add Provider profile');
  });
  await page.getByTestId('profile-menu-add-provider').click();
  await checkpoint(page, capture, '02-add-provider-step-1.png', async () => {
    await expectVisibleText(page, 'Add Provider');
    await expectVisibleText(page, 'Mock Provider');
    await expectVisibleText(page, 'image-endpoint');
  });
  await assertNoBrokenImages(page);
}

async function addProviderSaveScenario({ page, url, capture }) {
  await openAddProviderStep2(page, url);
  await fillMockProviderDraft(page, 'Mock Profile E2E');
  await page.getByTestId('provider-api-key-toggle').click();
  await expectControlProperty(page.getByTestId('provider-api-key-input'), 'type', 'text', 'API key input did not switch to text type');
  await page.getByTestId('provider-api-key-toggle').click();
  await expectControlProperty(page.getByTestId('provider-api-key-input'), 'type', 'password', 'API key input did not switch back to password type');
  await checkpoint(page, capture, '03-add-provider-step-2-filled.png', async () => {
    await expectVisibleText(page, 'Alias');
    await expectVisibleText(page, 'Base URL');
    await expectVisibleText(page, 'Default model');
    await expectVisibleText(page, 'API Key');
    await expectNoVisibleSecret(page);
  });
  await page.getByTestId('provider-save-button').click();
  await checkpoint(page, capture, '04-provider-detail-after-save.png', async () => {
    await expectVisibleText(page, 'Mock Profile E2E');
    await expectVisibleText(page, 'Enabled');
    await expectSavedSecretPlaceholder(page);
    await expectNoVisibleSecret(page);
  });
  await assertNoBrokenImages(page);
}

async function addProviderTestScenario({ page, url, capture }) {
  await openAddProviderStep2(page, url);
  await fillMockProviderDraft(page, 'Mock Profile E2E');
  const testButton = page.getByTestId('provider-test-button');
  await testButton.click();
  await checkpoint(page, capture, '05-add-provider-testing.png', async () => {
    await page.getByText('Testing...', { exact: true }).waitFor({ state: 'visible', timeout: 3000 });
    await expectControlDisabled(testButton, 'Test connection button');
  });
  await checkpoint(page, capture, '06-add-provider-test-connected.png', async () => {
    await expectVisibleText(page, 'Connected');
    await expectNoVisibleSecret(page);
    const snapshot = await page.evaluate(async () => globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.snapshot());
    if (snapshot?.profiles.length !== 1 || snapshot.profiles[0]?.displayName !== 'Mock Profile E2E') {
      throw new Error(`Unexpected tested draft profile snapshot: ${JSON.stringify(snapshot?.profiles)}`);
    }
  });
  await assertNoBrokenImages(page);
}

async function providerListAndEditScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  await checkpoint(page, capture, '07-settings-provider-list.png', async () => {
    await expectVisibleText(page, 'Configured');
    await expectVisibleText(page, 'Mock Profile');
    await expectVisibleText(page, 'image-endpoint');
    await expectVisibleText(page, 'Enabled');
    await expectVisibleText(page, 'mock-image-v1');
  });
  await page.getByTestId('provider-row-mock-profile').click();
  await fillUxp(page.getByTestId('provider-alias-input'), 'Mock Profile Renamed');
  const enabled = page.getByText('Enable profile', { exact: true });
  await enabled.click();
  await expectVisibleText(page, 'Disabled');
  await enabled.click();
  await expectVisibleText(page, 'Enabled');
  await fillUxp(page.getByTestId('provider-api-key-input'), '');
  await checkpoint(page, capture, '08-provider-detail-editing.png', async () => {
    await expectVisibleText(page, 'Connection info');
    await expectVisibleText(page, 'Default model');
    await expectSavedSecretPlaceholder(page);
    await expectNoVisibleSecret(page);
  });
  await page.getByTestId('provider-save-button').click();
  await checkpoint(page, capture, '09-provider-detail-saved.png', async () => {
    await expectVisibleText(page, 'Saved');
    await expectVisibleText(page, 'Mock Profile Renamed');
    await expectNoVisibleSecret(page);
  });
  await page.getByTestId('provider-detail-back-button').click();
  await expectVisibleText(page, 'Mock Profile Renamed');
  await assertNoBrokenImages(page);
}

async function providerDetailActionsScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  await page.getByTestId('provider-row-mock-profile').click();
  const testButton = page.getByTestId('provider-test-button');
  await testButton.click();
  await page.getByText('Testing...', { exact: true }).waitFor({ state: 'visible', timeout: 3000 });
  await checkpoint(page, capture, '10-provider-detail-test-connected.png', async () => {
    await expectVisibleText(page, 'Connected');
  });
  const refreshButton = page.getByTestId('provider-refresh-models-button');
  await refreshButton.click();
  await checkpoint(page, capture, '11-provider-detail-refreshing-models.png', async () => {
    await page.getByText('Refreshing...', { exact: true }).waitFor({ state: 'visible', timeout: 3000 });
  });
  await expectVisibleText(page, 'mock-image-v1');
  await page.getByTestId('provider-delete-button').click();
  await checkpoint(page, capture, '12-settings-after-delete.png', async () => {
    await expectVisibleText(page, 'Providers');
    await expectVisibleText(page, 'No Provider profile');
  });
  await assertNoBrokenImages(page);
}

async function mainProfileModelMenusScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await expectVisibleText(page, 'mock-image-v1');
  await page.getByTestId('main-profile-selector').click();
  await checkpoint(page, capture, '13-main-provider-menu.png', async () => {
    await page.getByTestId('profile-menu-option-mock-profile').waitFor({ state: 'visible' });
  });
  await page.getByTestId('profile-menu-option-mock-profile').click();
  await page.getByTestId('main-model-selector').click();
  await checkpoint(page, capture, '14-main-model-menu.png', async () => {
    await page.getByTestId('model-menu-option-mock-image-v1').waitFor({ state: 'visible' });
  });
  await page.getByTestId('model-menu-option-mock-image-v1').click();
  await page.mouse.click(10, 120);
  await checkpoint(page, capture, '15-main-selected-profile-model.png', async () => {
    await expectVisibleText(page, 'Mock Profile');
    await expectVisibleText(page, 'mock-image-v1');
    if (await page.getByTestId('model-menu-option-mock-image-v1').count() > 0) {
      throw new Error('Model menu did not close after outside click.');
    }
  });
  await assertNoBrokenImages(page);
}

async function promptSuggestionGenerateScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByText('Product photo of a blue glass perfume bottle', { exact: true }).click();
  await checkpoint(page, capture, '16-main-suggestion-filled.png', async () => {
    await page.getByTestId('composer-textarea').evaluate((textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement) || !textarea.value.includes('blue glass perfume')) {
        throw new Error('Suggestion did not fill the composer textarea.');
      }
    });
    await page.getByTestId('composer-send-button').evaluate((button) => {
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        throw new Error('Send button is disabled after prompt suggestion.');
      }
    });
  });
  await page.getByTestId('composer-send-button').click();
  await checkpoint(page, capture, '17-main-generate-result.png', async () => {
    await waitForDoneResult(page);
    await expectVisibleText(page, 'Mock Profile');
    await expectVisibleText(page, 'Place in PS');
    await page.getByTestId('composer-textarea').evaluate((textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement) || textarea.value !== '') {
        throw new Error('Composer textarea did not clear after submit.');
      }
    });
  });
  await assertNoBrokenImages(page);
}

async function layerAttachmentEditScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('composer-add-image-button').click();
  await checkpoint(page, capture, '18-attach-picker.png', async () => {
    await expectVisibleText(page, 'Choose from PS layers');
    await expectVisibleText(page, '10 layers');
    await expectVisibleText(page, 'Upload from computer');
  });
  await page.getByTestId('attach-ps-layers-option').click();
  await checkpoint(page, capture, '19-layer-list.png', async () => {
    await expectVisibleText(page, 'PS Layers');
    await page.getByTestId('layer-row-1').waitFor({ state: 'visible' });
    await expectVisibleText(page, 'sim-layer-1.svg');
  });
  await page.getByTestId('layer-row-1').click();
  await checkpoint(page, capture, '20-layer-attached-toast.png', async () => {
    await expectVisibleText(page, 'Layer added');
    await page.locator('.att-thumb').first().waitFor({ state: 'visible', timeout: 5000 });
  });
  await submitPrompt(page, 'edit layer image');
  await checkpoint(page, capture, '21-edit-result-from-layer.png', async () => {
    await waitForDoneResult(page);
  });
  await assertNoBrokenImages(page);
}

async function fileUploadEditScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('composer-add-image-button').click();
  await checkpoint(page, capture, '22-file-attached-toast.png', async () => {
    await expectVisibleText(page, 'Upload from computer');
    await expectVisibleText(page, 'PNG / JPG / WebP');
  });
  await page.getByTestId('attach-upload-option').click();
  await expectVisibleText(page, 'Image added');
  await submitPrompt(page, 'edit uploaded image');
  await checkpoint(page, capture, '23-edit-result-from-file.png', async () => {
    await waitForDoneResult(page);
  });
  await assertNoBrokenImages(page);
}

async function attachmentRemovalCancelScenario({ page, url, capture }) {
  await openApp(page, url);
  await addFileAttachment(page);
  await page.getByTestId('toast').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
  await page.locator('[data-testid^="attachment-remove-button-"]').first().click();
  await checkpoint(page, capture, '24-attachment-removed.png', async () => {
    if (await page.locator('.att-thumb').count() !== 0) {
      throw new Error('Attachment thumbnail remained after remove.');
    }
  });
  await page.evaluate(() => globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.setFilePickerMode('cancel'));
  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-upload-option').click();
  await checkpoint(page, capture, '25-file-picker-cancelled.png', async () => {
    if (await page.locator('.att-thumb').count() !== 0) {
      throw new Error('Cancelled picker changed composer attachments.');
    }
    if (await page.getByText('Image added', { exact: true }).count() > 0) {
      throw new Error('Cancelled picker showed image-added toast.');
    }
  });
  await assertNoBrokenImages(page);
}

async function generatedResultActionsScenario({ page, url, capture }) {
  await openApp(page, url);
  await submitPrompt(page, 'result actions prompt');
  await waitForDoneResult(page);
  await page.locator('[data-testid^="result-place-button-"]').first().click();
  await checkpoint(page, capture, '26-place-success-toast.png', async () => {
    await expectVisibleText(page, 'Placed on Photoshop canvas');
  });
  await page.locator('[data-testid^="result-copy-button-"]').first().click();
  await checkpoint(page, capture, '27-copy-prompt-toast.png', async () => {
    await expectVisibleText(page, 'Filled into the prompt box');
    await page.getByTestId('composer-textarea').evaluate((textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement) || !textarea.value.includes('result actions prompt')) {
        throw new Error('Copy prompt did not fill composer textarea.');
      }
    });
  });
  await page.locator('[data-testid^="result-regenerate-button-"]').first().click();
  await checkpoint(page, capture, '28-regenerate-result.png', async () => {
    await waitForDoneResult(page);
  });
  await assertNoBrokenImages(page);
}

async function errorRetryScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.evaluate(async () => globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.setMockFailureMode('always'));
  await submitPrompt(page, 'controlled failure prompt');
  await checkpoint(page, capture, '29-main-error-card.png', async () => {
    await expectVisibleText(page, 'Failed · Mock Profile');
    await page.getByText('Mock provider forced failure').first().waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleText(page, 'Retry');
  });
  await page.evaluate(async () => globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.setMockFailureMode('none'));
  await page.locator('[data-testid^="error-retry-button-"]').first().click();
  await checkpoint(page, capture, '30-main-retry-success.png', async () => {
    await waitForDoneResult(page);
  });
  await assertNoBrokenImages(page);
}

async function historyFiltersScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.evaluate(async () => globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.setMockFailureMode('always'));
  await submitPrompt(page, 'current failed history prompt');
  await expectVisibleText(page, 'Failed · Mock Profile');
  await page.getByTestId('main-history-button').click();
  await checkpoint(page, capture, '31-history-all.png', async () => {
    await expectVisibleText(page, 'History');
    await expectVisibleText(page, 'completed history prompt');
    await expectVisibleText(page, 'failed history prompt');
    await expectVisibleText(page, 'running history prompt');
  });
  await page.getByTestId('history-filter-ok').click();
  await checkpoint(page, capture, '32-history-done-filter.png', async () => {
    await expectVisibleText(page, 'completed history prompt');
  });
  await page.getByTestId('history-filter-running').click();
  await checkpoint(page, capture, '33-history-running-filter.png', async () => {
    await expectVisibleText(page, 'running history prompt');
  });
  await page.getByTestId('history-filter-err').click();
  await checkpoint(page, capture, '34-history-failed-filter.png', async () => {
    await expectVisibleText(page, 'failed history prompt');
    await expectVisibleText(page, 'Retry');
  });
  await page.getByTestId('history-refresh-button').click();
  await page.getByTestId('history-back-button').click();
  await expectVisibleText(page, 'Current session');
  await assertNoBrokenImages(page);
}

async function hostCapabilityFailureScenario({ page, origin, capture, resetNetworkEvidence }) {
  resetNetworkEvidence();
  await openApp(page, `${origin}/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=host-busy`);
  resetNetworkEvidence();
  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-ps-layers-option').click();
  await checkpoint(page, capture, '35-host-busy-toast.png', async () => {
    await expectVisibleText(page, 'Simulator host is busy.');
  });

  resetNetworkEvidence();
  await openApp(page, `${origin}/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=place-asset-failure`);
  resetNetworkEvidence();
  await submitPrompt(page, 'place failure prompt');
  await waitForDoneResult(page);
  await page.locator('[data-testid^="result-place-button-"]').first().click();
  await checkpoint(page, capture, '36-place-failure-toast.png', async () => {
    await expectVisibleText(page, 'Simulator place asset failed.');
  });

  resetNetworkEvidence();
  await openApp(page, `${origin}/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=empty-document`);
  resetNetworkEvidence();
  await page.getByTestId('composer-add-image-button').click();
  await page.getByTestId('attach-ps-layers-option').click();
  await checkpoint(page, capture, '37-empty-layer-list.png', async () => {
    await expectVisibleText(page, 'No available layers');
    await page.locator('#root[data-status="ok"]').waitFor({ timeout: 1000 });
  });
  await assertNoBrokenImages(page);
}

async function persistenceSmokeScenario({ page, origin, capture }) {
  const dbName = `chrome-e2e-${runId}`;
  const url = `${origin}/index.html?testHarness=1&storage=indexed-db&db=${encodeURIComponent(dbName)}&resetStorage=1&scenario=seeded-document`;
  await openAddProviderStep2(page, url);
  await fillMockProviderDraft(page, 'Mock Persisted E2E');
  await page.getByTestId('provider-save-button').click();
  await expectVisibleText(page, 'Mock Persisted E2E');
  await page.goto(normalizeAppUrl(`${origin}/index.html?testHarness=1&storage=indexed-db&db=${encodeURIComponent(dbName)}&scenario=seeded-document`), { waitUntil: 'networkidle' });
  await page.locator('#root[data-runtime="chrome"][data-status="ok"]').waitFor({ timeout: 10000 });
  await checkpoint(page, capture, '38-persisted-provider-after-reload.png', async () => {
    await expectVisibleText(page, 'Mock Persisted E2E');
    await expectVisibleText(page, 'mock-image-v1');
    await page.getByTestId('main-providers-button').click();
    await page.locator('[data-testid^="provider-row-profile-"]').first().click();
    await expectSavedSecretPlaceholder(page);
    await expectNoVisibleSecret(page);
  });
  await assertNoBrokenImages(page);
}

async function assertNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => {
    const root = document.getElementById('root');
    const panel = root?.querySelector('.panel');
    const el = panel ?? root ?? document.body;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  if (overflow.scrollWidth > overflow.clientWidth) {
    throw new Error(`Horizontal scroll detected: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`);
  }
}

async function assertCoreControlsVisible(page) {
  const selectors = [
    '[data-testid="composer-textarea"]',
    '[data-testid="composer-send-button"]',
    '[data-testid="composer-add-image-button"]',
  ];
  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    if (count === 0) {
      throw new Error(`Core control not found: ${selector}`);
    }
  }
}

async function assertPanelFillsRoot(page) {
  const result = await page.evaluate(() => {
    const root = document.getElementById('root');
    const panel = root?.querySelector('.panel');
    if (!root || !panel) {
      return { ok: false, reason: 'root or panel missing' };
    }
    const rootRect = root.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      ok: Math.abs(panelRect.width - rootRect.width) < 2 && Math.abs(panelRect.height - rootRect.height) < 2,
      rootWidth: Math.round(rootRect.width),
      rootHeight: Math.round(rootRect.height),
      panelWidth: Math.round(panelRect.width),
      panelHeight: Math.round(panelRect.height),
    };
  });
  if (!result.ok) {
    throw new Error(`Panel does not fill root: ${JSON.stringify(result)}`);
  }
}

async function assertSinglePrimaryScroll(page, expectedSelector) {
  const scrollables = await page.evaluate((selector) => {
    const target = document.querySelector(selector);
    if (!target) {
      return { found: false };
    }
    const style = window.getComputedStyle(target);
    return {
      found: true,
      overflowY: style.overflowY,
      flex: style.flex,
      minHeight: style.minHeight,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
    };
  }, expectedSelector);
  if (!scrollables.found) {
    throw new Error(`Primary scroll container not found: ${expectedSelector}`);
  }
  if (scrollables.overflowY !== 'auto' && scrollables.overflowY !== 'scroll') {
    throw new Error(`Primary scroll container ${expectedSelector} has overflow-y=${scrollables.overflowY}`);
  }
}

async function assertOverlayWithinPanel(page, overlaySelector) {
  const result = await page.evaluate((selector) => {
    const panel = document.querySelector('.panel');
    const overlay = document.querySelector(selector);
    if (!panel || !overlay) {
      return { ok: false, reason: 'panel or overlay missing' };
    }
    const panelRect = panel.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return {
      ok: overlayRect.left >= panelRect.left - 1 &&
        overlayRect.right <= panelRect.right + 1 &&
        overlayRect.top >= panelRect.top - 1 &&
        overlayRect.bottom <= panelRect.bottom + 1,
      panelRight: Math.round(panelRect.right),
      overlayRight: Math.round(overlayRect.right),
    };
  }, overlaySelector);
  if (!result.ok) {
    throw new Error(`Overlay ${overlaySelector} escapes panel: ${JSON.stringify(result)}`);
  }
}

async function responsiveNarrowScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await assertCoreControlsVisible(page);
  await assertSinglePrimaryScroll(page, '.scroll');
  await capture('responsive-narrow-empty.png');

  await page.getByText('Product photo of a blue glass perfume bottle', { exact: true }).click();
  await page.getByTestId('composer-send-button').click();
  await waitForDoneResult(page);
  await assertNoHorizontalScroll(page);
  await assertCoreControlsVisible(page);
  await capture('responsive-narrow-with-result.png');
  await assertNoBrokenImages(page);
}

async function responsiveNarrowOverlayScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');

  await page.getByTestId('main-profile-selector').click();
  await page.getByTestId('profile-menu-option-mock-profile').waitFor({ state: 'visible' });
  await assertOverlayWithinPanel(page, '.model-menu');
  await capture('responsive-narrow-profile-menu.png');
  await page.mouse.click(10, 120);

  await page.getByTestId('composer-add-image-button').click();
  await expectVisibleText(page, 'Choose from PS layers');
  await assertOverlayWithinPanel(page, '.attach-picker');
  await capture('responsive-narrow-attach-picker.png');
  await page.getByTestId('attach-ps-layers-option').click();
  await page.getByTestId('layer-row-1').waitFor({ state: 'visible' });
  await assertOverlayWithinPanel(page, '.layer-list-wrap');
  await capture('responsive-narrow-layer-list.png');
  await assertNoBrokenImages(page);
}

async function responsiveWideScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);

  await submitPrompt(page, 'wide panel test prompt');
  await waitForDoneResult(page);
  await assertNoHorizontalScroll(page);
  await capture('responsive-wide-with-result.png');
  await assertNoBrokenImages(page);
}

async function responsiveShortScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await assertCoreControlsVisible(page);
  await assertSinglePrimaryScroll(page, '.scroll');

  await submitPrompt(page, 'short panel test prompt');
  await waitForDoneResult(page);
  await assertNoHorizontalScroll(page);
  await assertCoreControlsVisible(page);
  await capture('responsive-short-with-result.png');
  await assertNoBrokenImages(page);
}

async function responsiveNarrowShortScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await assertCoreControlsVisible(page);

  await submitPrompt(page, 'narrow short stress test');
  await waitForDoneResult(page);
  await assertNoHorizontalScroll(page);
  await assertCoreControlsVisible(page);
  await capture('responsive-narrow-short-stress.png');
  await assertNoBrokenImages(page);
}

async function responsiveSettingsNarrowScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  await expectVisibleText(page, 'Providers');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await assertSinglePrimaryScroll(page, '.scroll');
  await capture('responsive-narrow-settings.png');

  await page.getByTestId('providers-add-button').click();
  await expectVisibleText(page, 'Add Provider');
  await assertNoHorizontalScroll(page);
  await capture('responsive-narrow-settings-add.png');
  await assertNoBrokenImages(page);
}

async function responsiveHistoryNarrowScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('main-history-button').click();
  await expectVisibleText(page, 'History');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await assertSinglePrimaryScroll(page, '.scroll');
  await capture('responsive-narrow-history.png');
  await assertNoBrokenImages(page);
}

const scenarios = [
  {
    id: '00-smoke-main-empty',
    name: 'Chrome shell smoke',
    tags: ['smoke', 'providers'],
    path: '/index.html?testHarness=1&storage=memory&scenario=seeded-document',
    screenshotName: '00-smoke-main-empty.png',
    assertions: ['root chrome ok', 'first-run copy visible', 'send disabled', 'no broken images', 'no console/page/network errors'],
    run: smokeScenario,
  },
  {
    id: 'harness-seeded-profile',
    name: 'Chrome test harness seeded profile',
    tags: ['harness'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&seedHistory=1&scenario=seeded-document',
    screenshotName: '01-harness-seeded-profile.png',
    assertions: ['root chrome ok', 'seeded profile visible', 'seeded history snapshot', 'mock failure hook mutable', 'file picker cancel hook mutable', 'no console/page/network errors'],
    run: harnessScenario,
  },
  {
    id: '01-first-run-provider-navigation',
    name: 'First-run provider navigation',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&scenario=seeded-document',
    screenshotName: '02-add-provider-step-1.png',
    assertions: ['profile dropdown empty', 'add provider step one visible', 'mock provider selectable', 'no console/page/network errors'],
    run: firstRunProviderNavigationScenario,
  },
  {
    id: '02-add-provider-save-flow',
    name: 'Add provider save flow',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&scenario=seeded-document',
    screenshotName: '04-provider-detail-after-save.png',
    assertions: ['add provider form labels visible', 'api key visibility toggles', 'provider detail after save', 'secret hidden', 'no console/page/network errors'],
    run: addProviderSaveScenario,
  },
  {
    id: '03-add-provider-test-flow',
    name: 'Add provider test flow',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&scenario=seeded-document',
    screenshotName: '06-add-provider-test-connected.png',
    assertions: ['test connection pending disabled', 'test connection connected', 'draft profile persisted', 'secret hidden', 'no console/page/network errors'],
    run: addProviderTestScenario,
  },
  {
    id: '04-provider-list-detail-edit',
    name: 'Provider list and detail edit',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '09-provider-detail-saved.png',
    assertions: ['provider list row visible', 'detail edit controls visible', 'enable toggle changes status', 'alias saved', 'secret hidden', 'no console/page/network errors'],
    run: providerListAndEditScenario,
  },
  {
    id: '05-provider-detail-actions',
    name: 'Provider detail test refresh delete',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '12-settings-after-delete.png',
    assertions: ['detail test connected', 'refresh models pending visible', 'mock model visible', 'delete returns to empty providers', 'no console/page/network errors'],
    run: providerDetailActionsScenario,
  },
  {
    id: '06-main-profile-model-menus',
    name: 'Main profile and model menus',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '15-main-selected-profile-model.png',
    assertions: ['provider menu active option visible', 'model menu active option visible', 'selected profile and model visible', 'menus close', 'no console/page/network errors'],
    run: mainProfileModelMenusScenario,
  },
  {
    id: '07-prompt-suggestion-generate',
    name: 'Prompt suggestions and send generate',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '17-main-generate-result.png',
    assertions: ['suggestion fills prompt', 'send enabled', 'generate result done', 'preview visible', 'actions visible', 'no console/page/network errors'],
    run: promptSuggestionGenerateScenario,
  },
  {
    id: '08-layer-attachment-edit',
    name: 'Attachment picker layer flow and edit submit',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '21-edit-result-from-layer.png',
    assertions: ['attach picker visible', 'layer list visible', 'layer attachment toast visible', 'edit result done', 'no console/page/network errors'],
    run: layerAttachmentEditScenario,
  },
  {
    id: '09-file-upload-edit',
    name: 'File upload flow',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document&filePicker=image',
    screenshotName: '23-edit-result-from-file.png',
    assertions: ['upload option visible', 'file attachment toast visible', 'file edit result done', 'no console/page/network errors'],
    run: fileUploadEditScenario,
  },
  {
    id: '10-attachment-removal-cancel',
    name: 'Attachment removal and cancelled picker',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document&filePicker=image',
    screenshotName: '25-file-picker-cancelled.png',
    assertions: ['attachment removed', 'cancelled picker unchanged', 'no cancellation toast', 'no console/page/network errors'],
    run: attachmentRemovalCancelScenario,
  },
  {
    id: '11-generated-result-actions',
    name: 'Generated result actions',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '28-regenerate-result.png',
    assertions: ['place success toast visible', 'copy prompt toast visible', 'regenerate result done', 'no console/page/network errors'],
    run: generatedResultActionsScenario,
  },
  {
    id: '12-error-retry-flow',
    name: 'Error and retry flow',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '30-main-retry-success.png',
    assertions: ['controlled error card visible', 'retry button visible', 'retry success result visible', 'no console/page/network errors'],
    run: errorRetryScenario,
  },
  {
    id: '13-history-filters',
    name: 'History page filters and retry affordance',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&seedHistory=1&scenario=seeded-document',
    screenshotName: '34-history-failed-filter.png',
    assertions: ['history all filter visible', 'done filter visible', 'running filter visible', 'failed filter visible', 'back returns main', 'no console/page/network errors'],
    run: historyFiltersScenario,
  },
  {
    id: '14-host-capability-failures',
    name: 'Host capability failure states',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '37-empty-layer-list.png',
    assertions: ['host busy visible message', 'place failure toast visible', 'empty layer list visible', 'root remains ok', 'no console/page/network errors'],
    run: hostCapabilityFailureScenario,
  },
  {
    id: '15-persistence-smoke',
    name: 'Persistence smoke',
    tags: ['persistence'],
    path: '/index.html?testHarness=1&storage=indexed-db&scenario=seeded-document',
    screenshotName: '38-persisted-provider-after-reload.png',
    assertions: ['profile persists after reload', 'persisted profile selectable', 'saved secret placeholder visible', 'secret hidden', 'no console/page/network errors'],
    run: persistenceSmokeScenario,
  },
  {
    id: 'responsive-narrow-390x720',
    name: 'Responsive narrow width 390x720',
    tags: ['responsive'],
    viewport: { width: 300, height: 520, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'responsive-narrow-empty.png',
    assertions: ['panel fills root', 'no horizontal scroll', 'core controls visible', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveNarrowScenario,
  },
  {
    id: 'responsive-narrow-overlay-300x520',
    name: 'Responsive narrow overlay containment 300x520',
    tags: ['responsive'],
    viewport: { width: 300, height: 520, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'responsive-narrow-profile-menu.png',
    assertions: ['profile menu within panel', 'attach picker within panel', 'layer list within panel', 'no broken images', 'no console/page/network errors'],
    run: responsiveNarrowOverlayScenario,
  },
  {
    id: 'responsive-wide-600x800',
    name: 'Responsive wide panel 600x800',
    tags: ['responsive'],
    viewport: { width: 600, height: 800, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'responsive-wide-with-result.png',
    assertions: ['panel fills root', 'no horizontal scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveWideScenario,
  },
  {
    id: 'responsive-short-390x400',
    name: 'Responsive short height 390x400',
    tags: ['responsive'],
    viewport: { width: 390, height: 400, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'responsive-short-with-result.png',
    assertions: ['panel fills root', 'no horizontal scroll', 'core controls visible', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveShortScenario,
  },
  {
    id: 'responsive-narrow-short-300x400',
    name: 'Responsive narrow + short stress 300x400',
    tags: ['responsive'],
    viewport: { width: 300, height: 400, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'responsive-narrow-short-stress.png',
    assertions: ['panel fills root', 'no horizontal scroll', 'core controls visible', 'no broken images', 'no console/page/network errors'],
    run: responsiveNarrowShortScenario,
  },
  {
    id: 'responsive-settings-narrow-300x520',
    name: 'Responsive settings narrow 300x520',
    tags: ['responsive'],
    viewport: { width: 300, height: 520, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'responsive-narrow-settings.png',
    assertions: ['panel fills root', 'no horizontal scroll', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveSettingsNarrowScenario,
  },
  {
    id: 'responsive-history-narrow-300x520',
    name: 'Responsive history narrow 300x520',
    tags: ['responsive'],
    viewport: { width: 300, height: 520, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&seedHistory=1&scenario=seeded-document',
    screenshotName: 'responsive-narrow-history.png',
    assertions: ['panel fills root', 'no horizontal scroll', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveHistoryNarrowScenario,
  },
];

function scenarioMatches(scenario, grep) {
  if (!grep) {
    return true;
  }
  const haystack = [scenario.id, scenario.name, ...scenario.tags].join(' ').toLowerCase();
  return haystack.includes(grep.toLowerCase());
}

async function writeRunReadme(entries) {
  const viewports = [...new Set(entries.map((entry) => `${entry.viewport.width}x${entry.viewport.height}`))];
  const lines = [
    '# Chrome E2E Run',
    '',
    `- Run id: ${runId}`,
    `- Viewports: ${viewports.join(', ')}`,
    `- KEEP_SCREENSHOTS: ${keepScreenshots ? '1' : '0'}`,
    '',
    '| Scenario | Status | Evidence | Notes |',
    '|---|---|---|---|',
    ...entries.map((entry) => `| ${entry.id} | ${entry.status} | ${entry.screenshotPath ?? ''} | ${entry.errorMessage ?? 'Assertions passed'} |`),
    '',
  ];
  await writeFile(resolve(artifactRoot, 'README.md'), lines.join('\n'));
}

async function runScenario(browser, server, scenario) {
  const scenarioViewport = scenario.viewport ?? defaultViewport;
  const context = await browser.newContext({
    viewport: { width: scenarioViewport.width, height: scenarioViewport.height },
    deviceScaleFactor: scenarioViewport.deviceScaleFactor,
  });
  await context.clearCookies();
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const retainedScreenshots = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.startsWith(server.origin)) {
      failedRequests.push(`${request.method()} ${url} ${request.failure()?.errorText ?? 'failed'}`);
    }
  });
  page.on('response', (response) => {
    const url = response.url();
    if (url.startsWith(server.origin) && response.status() >= 400) {
      failedRequests.push(`${response.status()} ${url}`);
    }
  });

  const startedAt = new Date().toISOString();
  const url = `${server.origin}${scenario.path ?? '/index.html'}`;
  const entry = {
    id: scenario.id,
    name: scenario.name,
    tags: scenario.tags,
    viewport: scenarioViewport,
    url,
    startedAt,
    status: 'passed',
    assertions: [],
    consoleErrorCount: 0,
  };
  const resetNetworkEvidence = () => {
    failedRequests.length = 0;
  };
  const capture = async (screenshotName) => {
    if (!keepScreenshots) {
      return;
    }
    const screenshotPath = resolve(artifactRoot, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    retainedScreenshots.push(relativeFromApp(screenshotPath));
  };

  try {
    await scenario.run({ page, origin: server.origin, url, capture, resetNetworkEvidence });
    if (consoleErrors.length > 0) {
      throw new Error(`Console errors: ${consoleErrors.join(' | ')}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
    }
    if (failedRequests.length > 0) {
      throw new Error(`Failed same-origin requests: ${failedRequests.join(' | ')}`);
    }
    entry.assertions.push(...scenario.assertions);
    if (keepScreenshots) {
      if (retainedScreenshots.length === 0) {
        await capture(scenario.screenshotName);
      }
      entry.screenshotPath = retainedScreenshots[0];
      entry.screenshots = retainedScreenshots;
    }
  } catch (error) {
    entry.status = 'failed';
    entry.errorMessage = sanitizeFailureReason(error);
    entry.consoleErrors = consoleErrors;
    entry.pageErrors = pageErrors;
    entry.failedRequests = failedRequests;
    const screenshotPath = resolve(failuresRoot, scenario.screenshotName);
    const failureJsonPath = resolve(failuresRoot, `${scenario.id}.json`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    entry.screenshotPath = relativeFromApp(screenshotPath);
    entry.failureJsonPath = relativeFromApp(failureJsonPath);
    await writeFile(failureJsonPath, JSON.stringify(entry, null, 2));
  } finally {
    entry.consoleErrorCount = consoleErrors.length;
    await context.close();
  }
  return entry;
}

async function main() {
  const grep = parseGrep(process.argv.slice(2));
  const selected = scenarios.filter((scenario) => scenarioMatches(scenario, grep));
  if (selected.length === 0) {
    throw new Error(`No Chrome E2E scenarios matched grep ${JSON.stringify(grep)}.`);
  }

  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(failuresRoot, { recursive: true });
  runBuild();
  if (!existsSync(resolve(webRoot, 'index.html'))) {
    throw new Error('Chrome build output is missing dist/web/index.html.');
  }

  const server = await createStaticServer();
  let browser;
  const entries = [];
  try {
    browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
    for (const scenario of selected) {
      entries.push(await runScenario(browser, server, scenario));
    }
  } catch (error) {
    const setupEntry = {
      id: 'runner-setup',
      name: 'Chrome E2E runner setup',
      tags: ['setup'],
      viewport,
      url: `${server.origin}/index.html`,
      status: 'failed',
      assertions: [],
      consoleErrorCount: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
    entries.push(setupEntry);
    await writeFile(resolve(failuresRoot, 'runner-setup.json'), JSON.stringify(setupEntry, null, 2));
  } finally {
    await browser?.close();
    await server.close();
  }

  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    runner: '@playwright/test chromium',
    grep,
    viewport: defaultViewport,
    webRoot: relativeFromApp(webRoot),
    scenarios: entries,
    summary: {
      total: entries.length,
      passed: entries.filter((entry) => entry.status === 'passed').length,
      failed: entries.filter((entry) => entry.status === 'failed').length,
    },
  };
  await writeFile(resolve(artifactRoot, 'report.json'), JSON.stringify(report, null, 2));
  await writeRunReadme(entries);
  console.log(`Chrome E2E report: ${relative(repoRoot, resolve(artifactRoot, 'report.json')).split(sep).join('/')}`);

  if (report.summary.failed > 0) {
    for (const failed of entries.filter((entry) => entry.status === 'failed')) {
      console.error(`${failed.id}: ${failed.errorMessage}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

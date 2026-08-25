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
const repoTestEnvPath = resolve(repoRoot, '.test.env');
const defaultViewport = { width: 390, height: 720, deviceScaleFactor: 1 };
const keepScreenshots = process.env.KEEP_SCREENSHOTS === '1';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactRoot = resolve(testRoot, 'screenshots', runId);
const failuresRoot = resolve(artifactRoot, 'failures');
let liveGeminiFixture;
let liveComfyUiFixture;

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

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!key) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function readRepoTestEnv() {
  if (!existsSync(repoTestEnvPath)) {
    return {};
  }
  return parseEnvFile(await readFile(repoTestEnvPath, 'utf8'));
}

function parseGeminiGenerateContentEndpoint(endpointUrl) {
  let parsed;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    throw new Error(`Chrome live Gemini fixture requires a valid URL, got ${JSON.stringify(endpointUrl)}.`);
  }
  const matched = parsed.pathname.match(/^(.*)\/models\/([^/]+):generateContent\/?$/);
  if (!matched) {
    throw new Error(
      `Chrome live Gemini fixture requires a Gemini generateContent endpoint like /models/{model}:generateContent, got ${parsed.pathname}.`,
    );
  }
  const prefix = matched[1] ?? '';
  const modelId = decodeURIComponent(matched[2] ?? '');
  if (!modelId) {
    throw new Error(`Chrome live Gemini fixture could not extract model id from ${endpointUrl}.`);
  }
  return {
    endpointUrl,
    baseUrl: `${parsed.origin}${prefix}`.replace(/\/+$/, ''),
    modelId,
    invokeTemplate: '/models/{model}:generateContent',
    countTokensUrl: endpointUrl.replace(/:generateContent\/?$/, ':countTokens'),
    legacyModelsUrl: `${parsed.origin}${prefix}/models`,
  };
}

function loadLiveGeminiFixture(env) {
  const endpointUrl = env.IMAGEN_CHROME_E2E_GRSAI_GEMINI_URL?.trim();
  const apiKey = env.IMAGEN_CHROME_E2E_GRSAI_GEMINI_API_KEY?.trim();
  if (!endpointUrl) {
    throw new Error(`Missing IMAGEN_CHROME_E2E_GRSAI_GEMINI_URL in ${repoTestEnvPath}.`);
  }
  if (!apiKey) {
    throw new Error(`Missing IMAGEN_CHROME_E2E_GRSAI_GEMINI_API_KEY in ${repoTestEnvPath}.`);
  }
  const authMode = env.IMAGEN_CHROME_E2E_GRSAI_GEMINI_AUTH_MODE?.trim() || 'x-goog-api-key';
  if (authMode !== 'x-goog-api-key' && authMode !== 'bearer' && authMode !== 'none') {
    throw new Error(`Unsupported IMAGEN_CHROME_E2E_GRSAI_GEMINI_AUTH_MODE=${JSON.stringify(authMode)}.`);
  }
  return {
    profileId: 'chrome-e2e-live-grsai-gemini',
    displayName: 'GrsAi Gemini Live',
    apiKey,
    authMode,
    ...parseGeminiGenerateContentEndpoint(endpointUrl),
  };
}

function requireLiveGeminiFixture() {
  if (!liveGeminiFixture) {
    throw new Error('Live Gemini fixture was not initialized.');
  }
  return liveGeminiFixture;
}

async function loadLiveComfyUiFixture(env) {
  const rawBaseUrl = env.IMAGEN_COMFYUI_LIVE_BASE_URL?.trim();
  if (!rawBaseUrl) {
    throw new Error(`Missing IMAGEN_COMFYUI_LIVE_BASE_URL in ${repoTestEnvPath}.`);
  }
  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error('Chrome live ComfyUI fixture requires a valid base URL.');
  }
  if (
    (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:')
    || parsedBaseUrl.username
    || parsedBaseUrl.password
    || parsedBaseUrl.search
    || parsedBaseUrl.hash
  ) {
    throw new Error('Chrome live ComfyUI fixture requires a credential-free HTTP(S) URL.');
  }
  const remotePath = env.IMAGEN_COMFYUI_LIVE_FRONTEND_WORKFLOW_PATH?.trim();
  return {
    baseUrl: parsedBaseUrl.toString().replace(/\/$/u, ''),
    ...(remotePath ? { frontendRemotePath: remotePath } : {}),
  };
}

function requireLiveComfyUiFixture() {
  if (!liveComfyUiFixture) {
    throw new Error('Live ComfyUI fixture was not initialized.');
  }
  return liveComfyUiFixture;
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

const fakeComfyUiBridgeLimits = {
  maxMessageBytes: 2_000_000,
  maxWorkflowPathBytes: 512,
  maxWorkflowListEntries: 1_000,
  maxMutations: 16,
  maxIdChars: 128,
  maxConfigureTimeoutMs: 30_000,
};

function fakeComfyUiTarget(pathname) {
  return pathname.match(/^\/__chrome-e2e-comfy\/([^/]+)(?:\/.*)?$/u)?.[1];
}

function fakeComfyUiDelay(target, phase) {
  if (target === 'attempt-a' && phase === 'frontend') return 60_000;
  if (target === 'attempt-a' && phase === 'api') return 150;
  if (target === 'target-b') return phase === 'bridge' ? 300 : 220;
  return 60;
}

function waitForResponseDelay(response, delayMs) {
  return new Promise((resolveDelay) => {
    const timer = setTimeout(done, delayMs);
    function done() {
      clearTimeout(timer);
      response.off('close', done);
      resolveDelay();
    }
    response.once('close', done);
  });
}

function fakeComfyUiFrontendHtml(target) {
  const workflow = {
    workflowId: `chrome-e2e-${target}`,
    nativeWorkflowId: `native-${target}`,
    displayName: `Chrome E2E ${target}`,
    remotePath: `Chrome E2E/${target}.json`,
    revision: `revision-${target}`,
  };
  return `<!doctype html><meta charset="utf-8"><script>
    const params = new URL(location.href).searchParams;
    const identity = {
      origin: params.get('imagenOrigin'),
      sourceId: params.get('imagenSourceId'),
      loadId: params.get('imagenLoadId'),
    };
    const limits = ${JSON.stringify(fakeComfyUiBridgeLimits)};
    const workflow = ${JSON.stringify(workflow)};
    addEventListener('message', (event) => {
      const request = event.data;
      if (!request || typeof request.requestId !== 'string' || event.origin !== identity.origin) return;
      let payload = {};
      if (request.command === 'handshake') {
        payload = {
          identity,
          protocolVersion: 1,
          bridgeVersion: 'chrome-e2e',
          frontendVersion: 'chrome-e2e',
          coreVersion: 'chrome-e2e',
          capabilities: { nativeQueue: true, workflowDiscovery: true, receiptObserver: true },
          limits,
        };
      } else if (request.command === 'list-workflows') {
        payload = { workflows: [workflow] };
      } else if (request.command === 'form-values') {
        payload = { values: { nodes: [] } };
      }
      const delay = request.command === 'handshake' ? ${fakeComfyUiDelay(target, 'bridge')} : 0;
      setTimeout(() => parent.postMessage({ requestId: request.requestId, ok: true, payload }, identity.origin), delay);
    });
  <\/script>`;
}

function createStaticServer() {
  const fakeComfyUiRequests = new Map();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const fakeTarget = fakeComfyUiTarget(url.pathname);
      if (fakeTarget) {
        const kind = url.pathname.endsWith('/system_stats') ? 'system-stats' : 'frontend';
        const requestKey = `${fakeTarget}:${kind}`;
        fakeComfyUiRequests.set(requestKey, (fakeComfyUiRequests.get(requestKey) ?? 0) + 1);
        await waitForResponseDelay(response, fakeComfyUiDelay(fakeTarget, kind === 'system-stats' ? 'api' : 'frontend'));
        if (response.destroyed) return;
        if (kind === 'system-stats') {
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ system: { comfyui_version: 'chrome-e2e' }, devices: [{}] }));
        } else {
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          response.end(fakeComfyUiFrontendHtml(fakeTarget));
        }
        return;
      }
      if (url.pathname === '/__invalid-comfyui/system_stats') {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end('{invalid-json');
        return;
      }
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
        fakeComfyUi: {
          requestCount(target, kind) {
            return fakeComfyUiRequests.get(`${target}:${kind}`) ?? 0;
          },
        },
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
  await locator.click();
  await locator.fill(value);
  await locator.press('Tab');
}

async function fillFormControl(locator, value) {
  await locator.evaluate((element, nextValue) => {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      throw new Error(`Cannot fill non-text control <${element.tagName.toLowerCase()}>.`);
    }
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, nextValue);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }, value);
}

async function clickControl(locator, label) {
  await locator.evaluate((control, expectedLabel) => {
    if (!control || control.disabled) {
      throw new Error(`${expectedLabel} was disabled or missing.`);
    }
    control.click();
  }, label);
}

function normalizeAppUrl(url) {
  return url;
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
  await page.getByTestId('provider-profile-api-key-input').evaluate((input) => {
    if (input.value !== '' || !input.placeholder) {
      throw new Error('Saved API Key field exposed a value or lost its replacement placeholder.');
    }
  });
}

async function openApp(page, url) {
  await page.goto(normalizeAppUrl(url), { waitUntil: 'networkidle' });
  await page.locator('#root[data-runtime="chrome"][data-status="ok"]').waitFor({ timeout: 10000 });
}

async function openAddProviderProfile(page, url) {
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  await page.getByTestId('settings-backend-provider').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByTestId('providers-add-button').click();
  await page.getByTestId('provider-picker-grsai').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByTestId('provider-picker-gemini').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByTestId('provider-picker-openai-images').waitFor({ state: 'visible', timeout: 5000 });
}

async function seedLiveGeminiProfile(page) {
  const fixture = requireLiveGeminiFixture();
  const savedProfileId = await page.evaluate(async (input) => {
    const runtime = globalThis.__IMAGEN_CHROME_RUNTIME__;
    if (!runtime) {
      throw new Error('Chrome runtime global is missing.');
    }
    const profileResult = await runtime.host.services.commands.saveProviderSurfaceProfile({
      implementationId: 'gemini-generate-content',
      profileId: input.profileId,
      displayName: input.displayName,
      apiKey: input.apiKey,
    });
    if (!profileResult.ok) {
      throw new Error(`${profileResult.error.category}: ${profileResult.error.message}`);
    }
    return profileResult.value.profileId;
  }, fixture);
  if (savedProfileId !== fixture.profileId) {
    throw new Error(`Unexpected live Gemini profile id: ${savedProfileId}`);
  }
  return fixture;
}

async function openComfyUiSettings(page) {
  await page.getByTestId('main-providers-button').click();
  await page.getByTestId('settings-backend-comfyui').click();
  await page.getByTestId('comfyui-settings-root').waitFor({ state: 'visible', timeout: 10000 });
}

function comfyUiTextVariants(text) {
  const fixed = new Map([
    ['Connect', '连接'],
    ['Reconnect', '重新连接'],
    ['Retry', '重试'],
    ['Connecting...', '连接中...'],
    ['Checking server...', '正在检查服务器...'],
    ['Loading Frontend Bridge...', '正在加载 Frontend Bridge...'],
    ['Validating Bridge...', '正在验证 Bridge...'],
    ['Saving connection...', '正在保存连接...'],
    ['Enter a complete http:// or https:// address without credentials, query, or fragment.', '请输入完整的 http:// 或 https:// 地址，且不要包含凭据、查询参数或片段。'],
    ['Could not connect to the ComfyUI server.', '无法连接 ComfyUI 服务器。'],
    ['ComfyUI returned an invalid server response.', 'ComfyUI 返回了无效的服务器响应。'],
  ]);
  const translated = fixed.get(text)
    ?? text.match(/^Connected to (.+)\.$/u)?.[1]?.replace(/^(.+)$/u, '已连接到 $1。')
    ?? text.match(/^Still connected to (.+)\.$/u)?.[1]?.replace(/^(.+)$/u, '仍连接到 $1。')
    ?? text.match(/^Currently connected to (.+)\. Connect to switch\.$/u)?.[1]?.replace(/^(.+)$/u, '当前连接到 $1。连接以切换。');
  return translated ? [text, translated] : [text];
}

async function expectComfyUiText(page, testId, text, timeout) {
  const candidates = comfyUiTextVariants(text);
  await page.waitForFunction(({ targetTestId, values }) => {
    const content = document.querySelector(`[data-testid="${targetTestId}"]`)?.textContent ?? '';
    return values.some((value) => content.includes(value));
  }, { targetTestId: testId, values: candidates }, { timeout });
}

async function expectComfyUiAction(page, label, timeout = 30_000) {
  await expectComfyUiText(page, 'comfyui-connect', label, timeout);
}

async function expectComfyUiStatus(page, text, timeout = 30_000) {
  await expectComfyUiText(page, 'comfyui-connection-status', text, timeout);
}

async function activeComfyUiBaseUrl(page) {
  return page.evaluate(() => globalThis.__IMAGEN_CHROME_RUNTIME__
    ?.host.services.comfyUi.getConnectionSnapshot().activeConnection?.target.baseUrl);
}

async function fillComfyUiAddress(page, baseUrl) {
  await fillFormControl(page.getByTestId('comfyui-address'), baseUrl);
}

async function chooseComfyUiWorkflow(page, remotePath) {
  await page.getByTestId('comfyui-change-workflow').click();
  const picker = page.getByTestId('comfyui-workflow-picker');
  await picker.waitFor({ state: 'visible', timeout: 30_000 });
  const option = remotePath
    ? picker.getByText(remotePath, { exact: true })
    : picker.locator('[data-testid^="comfyui-workflow-option-"]').first();
  await option.waitFor({ state: 'visible', timeout: 30_000 });
  await option.click();
  await picker.waitFor({ state: 'detached', timeout: 30_000 });
}

async function seedLiveComfyUiWorkflow(page) {
  const fixture = requireLiveComfyUiFixture();
  await openComfyUiSettings(page);
  await fillComfyUiAddress(page, fixture.baseUrl);
  await page.getByTestId('comfyui-connect').click();
  await expectComfyUiAction(page, 'Reconnect');
  await expectComfyUiStatus(page, `Connected to ${fixture.baseUrl}.`);
  await reloadWithoutStorageReset(page);
  await openComfyUiSettings(page);
  await expectComfyUiAction(page, 'Reconnect');
  await expectComfyUiStatus(page, `Connected to ${fixture.baseUrl}.`);
  const workflow = await page.evaluate(async (remotePath) => {
    const runtime = globalThis.__IMAGEN_CHROME_RUNTIME__;
    if (!runtime) {
      throw new Error('Chrome runtime global is missing.');
    }
    const management = runtime.host.services.comfyUi;
    const discovered = await management.discover();
    const selected = remotePath
      ? discovered.find((item) => item.remotePath === remotePath)
      : discovered[0];
    if (!selected) throw new Error('Live ComfyUI Frontend workflow was not discovered.');
    return selected;
  }, fixture.frontendRemotePath);
  await chooseComfyUiWorkflow(page, workflow.remotePath);
  return workflow;
}

async function reloadWithoutStorageReset(page) {
  await page.evaluate(() => {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete('resetStorage');
    globalThis.history.replaceState(null, '', url);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#root[data-runtime="chrome"][data-status="ok"]').waitFor({ timeout: 10000 });
}

async function comfyUiTaskEvidence(page) {
  return page.evaluate(async () => {
    const runtime = globalThis.__IMAGEN_CHROME_RUNTIME__;
    if (!runtime) throw new Error('Chrome runtime global is missing.');
    const tasks = await runtime.host.services.commands.listTaskRecords();
    const task = tasks.filter((item) => item.execution?.backend.id === 'comfyui').at(-1);
    if (!task) return undefined;
    return {
      taskId: task.taskId,
      status: task.status,
      outputCount: task.outputs.length,
      attachmentKinds: task.attachments.map((item) => item.kind),
      hasStoredOutput: task.outputs.every((output) => Boolean(output.asset.ref.ref)),
      errorCode: task.error?.code,
      remoteMayContinue: task.error?.details?.remoteMayContinue === true,
      serialized: JSON.stringify(task),
    };
  });
}

async function waitForTerminalComfyUiTask(page, timeoutMs = 300_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await comfyUiTaskEvidence(page);
    if (task && ['completed', 'failed', 'cancelled', 'interrupted'].includes(task.status)) {
      return task;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Live ComfyUI Task did not reach terminal state within ${timeoutMs}ms.`);
}

function remoteRequestEvidence(page, baseUrl) {
  const requests = [];
  const remoteOrigin = new URL(baseUrl).origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== remoteOrigin) return;
    requests.push({
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      frameUrl: request.frame().url(),
    });
  });
  return requests;
}

function assertLiveComfyUiNetwork(requests, remoteBaseUrl) {
  const uploads = requests.filter((request) => (
    request.method === 'POST' && new URL(request.path, 'https://comfy.invalid').pathname.endsWith('/upload/image')
  ));
  if (uploads.length !== 1) {
    throw new Error(`Live ComfyUI expected one image upload, got ${uploads.length}.`);
  }
  const submissions = requests.filter((request) => (
    request.method === 'POST' && new URL(request.path, 'https://comfy.invalid').pathname.endsWith('/api/prompt')
  ));
  if (submissions.length !== 1) {
    const postPaths = [...new Set(requests
      .filter((request) => request.method === 'POST')
      .map((request) => new URL(request.path, 'https://comfy.invalid').pathname)
      .filter((path) => /prompt|queue|upload/iu.test(path)))]
      .slice(0, 8);
    throw new Error(
      `Live ComfyUI expected one /api/prompt submission, got ${submissions.length}; POST paths=${postPaths.join(',') || 'none'}.`,
    );
  }
  const submissionFrameOrigin = new URL(submissions[0].frameUrl).origin;
  const expectedFrameOrigin = new URL(remoteBaseUrl).origin;
  if (submissionFrameOrigin !== expectedFrameOrigin) {
    throw new Error('Live ComfyUI submission owner mismatch for frontend workflow.');
  }
  if (!requests.some((request) => (
    request.method === 'GET' && /\/history\//u.test(new URL(request.path, 'https://comfy.invalid').pathname)
  ))) {
    throw new Error('Live ComfyUI did not reconcile acknowledged prompt history.');
  }
  if (!requests.some((request) => (
    request.method === 'GET' && new URL(request.path, 'https://comfy.invalid').pathname.endsWith('/view')
  ))) {
    throw new Error('Live ComfyUI did not download an output through /view.');
  }
}

function liveComfyUiRequestCounts(requests) {
  return {
    uploads: requests.filter((request) => request.method === 'POST' && request.path === '/upload/image').length,
    prompts: requests.filter((request) => (
      request.method === 'POST' && (request.path === '/prompt' || request.path === '/api/prompt')
    )).length,
    histories: requests.filter((request) => request.method === 'GET' && request.path.startsWith('/history/')).length,
    views: requests.filter((request) => request.method === 'GET' && request.path.startsWith('/view?')).length,
  };
}

async function runLiveComfyUiGeneration({ page, url, capture }) {
  const fixture = requireLiveComfyUiFixture();
  const requests = remoteRequestEvidence(page, fixture.baseUrl);
  await openApp(page, url);
  const seeded = await seedLiveComfyUiWorkflow(page);
  if (!requests.some((request) => (
    request.method === 'GET'
    && new URL(request.path, 'https://comfy.invalid').pathname.endsWith('/system_stats')
  ))) {
    throw new Error('Live ComfyUI Settings Connect did not probe /system_stats.');
  }

  const reconnectProbeCount = requests.filter((request) => (
    request.method === 'GET'
    && new URL(request.path, 'https://comfy.invalid').pathname.endsWith('/system_stats')
  )).length;
  await page.getByTestId('comfyui-connect').click();
  await expectComfyUiAction(page, 'Reconnect');
  await expectComfyUiStatus(page, `Connected to ${fixture.baseUrl}.`);
  const reconnectedProbeCount = requests.filter((request) => (
    request.method === 'GET'
    && new URL(request.path, 'https://comfy.invalid').pathname.endsWith('/system_stats')
  )).length;
  if (reconnectedProbeCount <= reconnectProbeCount) {
    throw new Error('Live ComfyUI Reconnect did not issue a new /system_stats probe.');
  }

  await fillComfyUiAddress(page, 'not-a-valid-url');
  await expectComfyUiStatus(page, 'Enter a complete http:// or https:// address without credentials, query, or fragment.');
  await expectComfyUiStatus(page, `Still connected to ${fixture.baseUrl}.`);
  await expectControlDisabled(page.getByTestId('comfyui-connect'), 'Invalid ComfyUI Connect button');
  if (await page.getByTestId('comfyui-address').getAttribute('aria-invalid') !== 'true') {
    throw new Error('Invalid ComfyUI address did not expose aria-invalid=true.');
  }

  const invalidResponseBaseUrl = `${new URL(url).origin}/__invalid-comfyui`;
  await fillComfyUiAddress(page, invalidResponseBaseUrl);
  await expectComfyUiAction(page, 'Connect');
  if (await page.getByTestId('comfyui-address').getAttribute('aria-invalid') !== null) {
    throw new Error('Syntactically valid unreachable ComfyUI address stayed marked invalid.');
  }
  await page.getByTestId('comfyui-connect').click();
  await expectComfyUiAction(page, 'Retry');
  await expectComfyUiStatus(page, 'ComfyUI returned an invalid server response.');
  await expectComfyUiStatus(page, `Still connected to ${fixture.baseUrl}.`);
  if (await activeComfyUiBaseUrl(page) !== fixture.baseUrl) {
    throw new Error('Failed live ComfyUI switch replaced the prior active connection.');
  }
  const remainingFrameSources = await page.locator('iframe[aria-hidden="true"]').evaluateAll(
    (frames) => frames.map((frame) => frame.getAttribute('src') ?? ''),
  );
  const activeOrigin = new URL(fixture.baseUrl).origin;
  if (remainingFrameSources.some((source) => new URL(source, fixture.baseUrl).origin !== activeOrigin)) {
    throw new Error('Failed live ComfyUI switch left a stale provisional iframe.');
  }
  const rediscovered = await page.evaluate(async () => (
    globalThis.__IMAGEN_CHROME_RUNTIME__?.host.services.comfyUi.discover() ?? []
  ));
  if (!rediscovered.some((workflow) => workflow.workflowId === seeded.workflowId)) {
    throw new Error('Old active ComfyUI connection could not rediscover workflows after failed switch.');
  }
  await fillComfyUiAddress(page, fixture.baseUrl);
  await expectComfyUiAction(page, 'Reconnect');
  await expectComfyUiStatus(page, `Connected to ${fixture.baseUrl}.`);
  await assertNoHorizontalScroll(page);
  await capture('live-comfyui-connection.png');

  if (!fixture.frontendRemotePath) {
    await page.evaluate(() => globalThis.__IMAGEN_CHROME_RUNTIME__?.dispose());
    await page.locator('iframe[aria-hidden="true"]').waitFor({ state: 'detached', timeout: 10000 });
    return {
      status: 'partial',
      note: 'Connection, reconnect, failure retention, and discovery passed; generation skipped because IMAGEN_COMFYUI_LIVE_FRONTEND_WORKFLOW_PATH is unset.',
    };
  }
  await reloadWithoutStorageReset(page);
  await page.getByTestId('main-profile-selector').click();
  await page.getByTestId('main-mode-comfyui').click();
  await expectVisibleText(page, seeded.displayName);
  await page.getByTestId('composer-capture-button').click();
  await page.locator('.att-thumb').first().waitFor({ state: 'visible', timeout: 10000 });
  await submitPrompt(page, 'D01 frontend-workflow image-only live proof');
  const task = await waitForTerminalComfyUiTask(page);
  if (task.status !== 'completed') {
    const counts = liveComfyUiRequestCounts(requests);
    throw new Error(
      `Live ComfyUI Task failed: code=${task.errorCode ?? 'unknown'} remoteMayContinue=${task.remoteMayContinue} uploads=${counts.uploads} prompts=${counts.prompts} histories=${counts.histories} views=${counts.views}.`,
    );
  }
  await page.locator('[data-testid^="result-preview-"]').first().waitFor({ state: 'attached', timeout: 30_000 });
  if (task.outputCount < 1 || !task.hasStoredOutput) {
    throw new Error('Live ComfyUI Task did not persist a stored TaskOutput.');
  }
  if (task.serialized.includes('promptId') || task.serialized.includes('operationId')) {
    throw new Error('Live ComfyUI Task leaked runtime-only submission identity.');
  }
  assertLiveComfyUiNetwork(requests, fixture.baseUrl);
  await capture('live-comfyui-frontend.png');
  await page.evaluate(() => globalThis.__IMAGEN_CHROME_RUNTIME__?.dispose());
  await page.locator('iframe[aria-hidden="true"]').waitFor({ state: 'detached', timeout: 10000 });
}

async function fillProviderProfileDraft(page, alias) {
  await fillFormControl(page.getByTestId('provider-profile-name-input'), alias);
  await fillFormControl(page.getByTestId('provider-profile-api-key-input'), 'mock-key');
}

async function submitPrompt(page, prompt, options = {}) {
  if (options.ensureCapture === true && await page.locator('.att-thumb').count() === 0) {
    await page.getByTestId('composer-capture-button').click();
    await page.locator('.att-thumb').first().waitFor({ state: 'visible', timeout: 5000 });
  }
  await fillUxp(page.getByTestId('composer-textarea'), prompt);
  await page.getByTestId('composer-send-button').evaluate((button) => {
    if (!button || button.disabled) {
      throw new Error('Send button did not become enabled before submit.');
    }
  });
  await page.getByTestId('composer-send-button').click();
}

async function waitForDoneResult(page) {
  await page.getByText('Done').first().waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-testid^="result-preview-"]').first().waitFor({ state: 'attached', timeout: 5000 });
}

async function expectMockResponseText(page) {
  const responseText = page.locator('[data-testid^="result-response-text-"]').first();
  await responseText.waitFor({ state: 'visible', timeout: 5000 });
  const text = await responseText.textContent();
  if (!text?.includes('[operation=text_to_image] [model=gpt-image-2]')) {
    throw new Error('Mock provider token response was not rendered in the Chrome result card.');
  }
  if (!text.includes('[app.output=size=2k format=png aspect=auto providerInputSize=1k]')) {
    throw new Error('Mock app context token response was not rendered in the Chrome result card.');
  }
  if (text.includes('collapsed')) {
    throw new Error('Obsolete response summary placeholder was rendered in the Chrome result card.');
  }
  if (await page.locator('.prov-response-details').count() > 0) {
    throw new Error('Obsolete provider response details block was rendered in the Chrome result card.');
  }
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
  await page.getByTestId('main-profile-selector').waitFor({ state: 'visible' });
  await page.getByTestId('main-model-selector').waitFor({ state: 'visible' });
  await page.getByTestId('composer-textarea').waitFor({ state: 'visible' });
  await page.getByTestId('composer-send-button').evaluate((button) => {
    if (!button || !button.disabled) {
      throw new Error('Send button is not disabled in first-run smoke state.');
    }
  });
  await assertNoBrokenImages(page);
  await capture('00-smoke-main-empty.png');
}

async function harnessScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await expectVisibleText(page, 'gpt-image-2');
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
    await page.getByTestId('profile-list-state-empty').locator('button').waitFor({ state: 'visible' });
  });
  await page.getByTestId('profile-list-state-empty').locator('button').click();
  await checkpoint(page, capture, '02-provider-picker.png', async () => {
    await page.getByTestId('provider-picker-grsai').waitFor({ state: 'visible' });
    await page.getByTestId('provider-picker-gemini').waitFor({ state: 'visible' });
    await page.getByTestId('provider-picker-openai-images').waitFor({ state: 'visible' });
  });
  await assertNoBrokenImages(page);
}

async function addProviderSaveScenario({ page, url, capture }) {
  await openAddProviderProfile(page, url);
  await page.getByTestId('provider-picker-openai-images').click();
  await fillProviderProfileDraft(page, 'OpenAI Images E2E');
  await checkpoint(page, capture, '03-openai-images-profile-filled.png', async () => {
    await expectVisibleText(page, 'GPT Image 2');
    await page.getByTestId('provider-profile-name-input').waitFor({ state: 'visible' });
    await page.getByTestId('provider-profile-api-key-input').waitFor({ state: 'visible' });
    await expectNoVisibleSecret(page);
  });
  await clickControl(page.getByTestId('provider-profile-save-button'), 'Save button');
  await checkpoint(page, capture, '04-provider-list-after-save.png', async () => {
    await page.locator('[data-testid^="provider-row-"]').filter({ hasText: 'OpenAI Images E2E' }).waitFor({ state: 'visible' });
    await page.getByTestId('toast').waitFor({ state: 'visible' });
    await expectNoVisibleSecret(page);
  });
  await assertNoBrokenImages(page);
}

async function providerProfileAllowlistScenario({ page, url, capture }) {
  await openAddProviderProfile(page, url);
  await page.getByTestId('provider-picker-gemini').click();
  await fillProviderProfileDraft(page, 'Gemini E2E');
  await checkpoint(page, capture, '05-gemini-profile-fields.png', async () => {
    await page.getByTestId('provider-profile-name-input').waitFor({ state: 'visible' });
    await page.getByTestId('provider-profile-api-key-input').waitFor({ state: 'visible' });
    if (await page.locator('[data-testid*="endpoint"], [data-testid*="billing"], [data-testid*="model-config"]').count() > 0) {
      throw new Error('Dedicated Gemini Profile exposed legacy wire configuration.');
    }
  });
  await expectNoVisibleSecret(page);
  await assertNoBrokenImages(page);
}

async function providerListAndEditScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  await checkpoint(page, capture, '07-settings-provider-list.png', async () => {
    await page.getByTestId('provider-row-mock-profile').waitFor({ state: 'visible' });
  });
  await page.getByTestId('provider-row-mock-profile').click();
  await fillFormControl(page.getByTestId('provider-profile-name-input'), 'Mock Profile Renamed');
  await checkpoint(page, capture, '08-provider-profile-editing.png', async () => {
    await expectVisibleText(page, 'GPT Image 2');
    await expectSavedSecretPlaceholder(page);
    await expectNoVisibleSecret(page);
  });
  await clickControl(page.getByTestId('provider-profile-save-button'), 'Save button');
  await checkpoint(page, capture, '09-provider-list-saved.png', async () => {
    await page.getByTestId('provider-row-mock-profile').waitFor({ state: 'visible' });
    await page.getByTestId('toast').waitFor({ state: 'visible' });
    await expectNoVisibleSecret(page);
  });
  await expectVisibleText(page, 'Mock Profile Renamed');
  await assertNoBrokenImages(page);
}

async function providerDetailActionsScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  await page.getByTestId('provider-row-mock-profile').click();
  await clickControl(page.getByTestId('provider-profile-delete-button'), 'Delete provider button');
  await clickControl(page.getByTestId('provider-profile-confirm-delete'), 'Confirm delete provider button');
  await checkpoint(page, capture, '12-settings-after-delete.png', async () => {
    await page.getByTestId('provider-empty-state').waitFor({ state: 'visible' });
  });
  await assertNoBrokenImages(page);
}

async function mainProfileModelMenusScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await page.getByTestId('main-profile-selector').click();
  await checkpoint(page, capture, '13-main-provider-menu.png', async () => {
    await page.getByTestId('profile-menu-option-mock-profile').waitFor({ state: 'visible' });
  });
  await page.getByTestId('profile-menu-option-mock-profile').click();
  await checkpoint(page, capture, '15-main-single-model-profile.png', async () => {
    await expectVisibleText(page, 'Mock Profile');
    const modelSelector = page.getByTestId('main-model-selector');
    await expectControlProperty(modelSelector, 'disabled', true, 'Single-model selector');
    await modelSelector.evaluate((button) => {
      if (button.getAttribute('data-selected-id') !== 'gpt-image-2') {
        throw new Error('Single-model selector lost the explicit gpt-image-2 selection.');
      }
    });
  });
  await assertNoBrokenImages(page);
}

async function promptSuggestionGenerateScenario({ page, url, capture }) {
  await openApp(page, url);
  await page.getByText('Pink-haired girl', { exact: true }).click();
  await checkpoint(page, capture, '16-main-suggestion-filled.png', async () => {
    await page.getByTestId('composer-textarea').evaluate((textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement) || !textarea.value.includes('girl with pink hair')) {
        throw new Error('Suggestion did not fill the composer textarea.');
      }
    });
    await page.getByTestId('composer-send-button').evaluate((button) => {
      if (!button || button.disabled) {
        throw new Error('Send button is disabled after prompt suggestion.');
      }
    });
  });
  await page.getByTestId('composer-send-button').click();
  await checkpoint(page, capture, '17-main-generate-result.png', async () => {
    await waitForDoneResult(page);
    await expectMockResponseText(page);
    await expectVisibleText(page, 'Mock Profile');
    await page.locator('[data-testid^="result-place-button-"]').first().waitFor({ state: 'attached', timeout: 5000 });
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
    await expectVisibleText(page, 'sim-layer-1.png');
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
  await checkpoint(page, capture, '26-result-actions-surface.png', async () => {
    await page.locator('[data-testid^="result-place-button-"]').first().waitFor({ state: 'attached', timeout: 5000 });
    await page.locator('[data-testid^="round-copy-button-"]').first().waitFor({ state: 'visible', timeout: 5000 });
  });
  await page.locator('[data-testid^="round-copy-button-"]').first().click();
  await checkpoint(page, capture, '27-copy-prompt-toast.png', async () => {
    await page.getByTestId('composer-textarea').evaluate((textarea) => {
      if (!(textarea instanceof HTMLTextAreaElement) || !textarea.value.includes('result actions prompt')) {
        throw new Error('Copy prompt did not fill composer textarea.');
      }
    });
  });
  await checkpoint(page, capture, '28-regenerate-result.png', async () => {
    await page.getByText('Done').first().waitFor({ state: 'visible', timeout: 5000 });
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
    await expectVisibleText(page, 'Use in prompt box');
  });
  await page.evaluate(async () => globalThis.__IMAGEN_CHROME_TEST_HARNESS__?.setMockFailureMode('none'));
  await page.getByTestId('main-history-button').click();
  await page.locator('[data-testid^="history-retry-button-"]').first().click();
  await page.getByText('Done', { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 });
  await page.getByTestId('history-back-button').click();
  await checkpoint(page, capture, '30-main-retry-success.png', async () => {
    await page.getByText('Done', { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleText(page, 'controlled failure prompt');
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
  await clickControl(page.getByTestId('history-filter-ok'), 'History done filter');
  await checkpoint(page, capture, '32-history-done-filter.png', async () => {
    await expectVisibleText(page, 'completed history prompt');
  });
  await clickControl(page.getByTestId('history-filter-running'), 'History running filter');
  await checkpoint(page, capture, '33-history-running-filter.png', async () => {
    await page.getByText(/No history yet/).first().waitFor({ state: 'visible', timeout: 5000 });
  });
  await clickControl(page.getByTestId('history-filter-err'), 'History failed filter');
  await checkpoint(page, capture, '34-history-failed-filter.png', async () => {
    await expectVisibleText(page, 'failed history prompt');
    await expectVisibleText(page, 'running history prompt');
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
  await page.locator('[data-testid^="result-place-button-"]').first().click({ force: true });
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
  await openAddProviderProfile(page, url);
  await page.getByTestId('provider-picker-openai-images').click();
  await fillProviderProfileDraft(page, 'OpenAI Persisted E2E');
  await clickControl(page.getByTestId('provider-profile-save-button'), 'Save button');
  await expectVisibleText(page, 'OpenAI Persisted E2E');
  await page.goto(normalizeAppUrl(`${origin}/index.html?testHarness=1&storage=indexed-db&db=${encodeURIComponent(dbName)}&scenario=seeded-document`), { waitUntil: 'networkidle' });
  await page.locator('#root[data-runtime="chrome"][data-status="ok"]').waitFor({ timeout: 10000 });
  await checkpoint(page, capture, '38-persisted-provider-after-reload.png', async () => {
    await expectVisibleText(page, 'OpenAI Persisted E2E');
    await expectVisibleText(page, 'gpt-image-2');
    await page.getByTestId('main-providers-button').click();
    await page.locator('[data-testid^="provider-row-profile-"]').first().click();
    await expectSavedSecretPlaceholder(page);
    await expectNoVisibleSecret(page);
  });
  await assertNoBrokenImages(page);
}

async function comfyUiConnectionTransactionScenario({ page, url, origin, capture, fakeComfyUi }) {
  const stableBaseUrl = `${origin}/__chrome-e2e-comfy/stable`;
  const attemptABaseUrl = `${origin}/__chrome-e2e-comfy/attempt-a`;
  const targetBBaseUrl = `${origin}/__chrome-e2e-comfy/target-b`;
  await openApp(page, url);
  await openComfyUiSettings(page);

  await fillComfyUiAddress(page, stableBaseUrl);
  await page.getByTestId('comfyui-connect').click();
  await expectComfyUiAction(page, 'Reconnect');
  await expectComfyUiStatus(page, `Connected to ${stableBaseUrl}.`);
  if (await activeComfyUiBaseUrl(page) !== stableBaseUrl) {
    throw new Error('Initial fake ComfyUI connection did not become active.');
  }

  await fillComfyUiAddress(page, attemptABaseUrl);
  await page.getByTestId('comfyui-connect').click();
  await expectComfyUiStatus(page, 'Checking server...');
  await expectComfyUiStatus(page, `Still connected to ${stableBaseUrl}.`);
  await expectComfyUiStatus(page, 'Loading Frontend Bridge...');
  const attemptAFrame = page.locator(`iframe[src^="${attemptABaseUrl}"]`);
  await attemptAFrame.waitFor({ state: 'attached', timeout: 10000 });

  await fillComfyUiAddress(page, targetBBaseUrl);
  await expectComfyUiAction(page, 'Connect');
  await expectComfyUiStatus(page, `Currently connected to ${stableBaseUrl}. Connect to switch.`);
  await attemptAFrame.waitFor({ state: 'detached', timeout: 10000 });
  if (await activeComfyUiBaseUrl(page) !== stableBaseUrl) {
    throw new Error('Superseding attempt A replaced the old active connection.');
  }
  if (fakeComfyUi.requestCount('target-b', 'system-stats') !== 0) {
    throw new Error('Editing target B auto-connected before explicit Connect.');
  }

  await page.getByTestId('comfyui-connect').click();
  await expectComfyUiStatus(page, 'Checking server...');
  await expectComfyUiStatus(page, 'Loading Frontend Bridge...');
  await expectComfyUiStatus(page, 'Validating Bridge...');
  await expectComfyUiStatus(page, 'Saving connection...');
  await expectComfyUiAction(page, 'Reconnect');
  await expectComfyUiStatus(page, `Connected to ${targetBBaseUrl}.`);
  if (await activeComfyUiBaseUrl(page) !== targetBBaseUrl) {
    throw new Error('Explicit target B Connect did not promote target B.');
  }
  await page.locator('iframe[aria-hidden="true"]').waitFor({ state: 'detached', timeout: 10000 });
  await assertNoHorizontalScroll(page);
  await capture('comfyui-connection-transaction.png');

  await reloadWithoutStorageReset(page);
  await openComfyUiSettings(page);
  await expectComfyUiAction(page, 'Reconnect');
  await expectComfyUiStatus(page, `Connected to ${targetBBaseUrl}.`);
  await page.getByTestId('comfyui-change-workflow').click();
  await page.getByText('Chrome E2E/target-b.json', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('comfyui-workflow-picker-back').click();
  await assertNoHorizontalScroll(page);
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
    '[data-testid="composer-action-row"]',
    '[data-testid="composer-toolbar"]',
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

async function expectPanelTheme(panel, expected) {
  const theme = await panel.getAttribute('data-app-theme');
  if (theme !== expected) {
    throw new Error(`Expected panel theme ${expected}, got ${theme ?? 'missing'}.`);
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

  await page.getByText('Pink-haired girl', { exact: true }).click();
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
  const profileMenu = page.locator('.model-menu');
  await profileMenu.waitFor({ state: 'visible', timeout: 10000 });
  await page.getByTestId('profile-menu-option-mock-profile').waitFor({ state: 'attached' });
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
  await expectVisibleText(page, 'Add provider');
  await assertNoHorizontalScroll(page);
  await capture('responsive-narrow-provider-picker.png');
  await assertNoBrokenImages(page);
}

async function responsiveSettingsRoutesScenario({ page, url, capture }) {
  const viewport = page.viewportSize();
  const suffix = `${viewport.width}x${viewport.height}`;
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  await page.getByTestId('settings-backend-provider').waitFor({ state: 'visible', timeout: 5000 });
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await assertSinglePrimaryScroll(page, '.scroll');
  await capture(`settings-provider-root-${suffix}.png`);

  await page.getByTestId('settings-backend-comfyui').click();
  await page.getByTestId('comfyui-settings-root').waitFor({ state: 'visible', timeout: 5000 });
  await assertNoHorizontalScroll(page);
  await assertSinglePrimaryScroll(page, '.scroll');
  await capture(`settings-comfyui-root-${suffix}.png`);

  await page.getByTestId('settings-backend-general').click();
  await page.getByTestId('global-settings-row').waitFor({ state: 'visible', timeout: 5000 });
  await assertNoHorizontalScroll(page);
  await assertSinglePrimaryScroll(page, '.scroll');
  await capture(`settings-general-root-${suffix}.png`);
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

async function responsiveMinSupportedScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await assertCoreControlsVisible(page);
  await assertSinglePrimaryScroll(page, '.scroll');
  await capture('responsive-min-supported-empty.png');

  await submitPrompt(page, 'minimum supported size test');
  await waitForDoneResult(page);
  await assertNoHorizontalScroll(page);
  await assertCoreControlsVisible(page);
  await capture('responsive-min-supported-with-result.png');
  await assertNoBrokenImages(page);
}

async function responsiveMinSupportedOverlayScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');

  await page.getByTestId('main-profile-selector').click();
  const profileMenu = page.locator('.model-menu');
  await profileMenu.waitFor({ state: 'visible', timeout: 10000 });
  await assertOverlayWithinPanel(page, '.model-menu');
  await capture('responsive-min-supported-profile-menu.png');
  await page.mouse.click(10, 120);

  await page.getByTestId('composer-add-image-button').click();
  await expectVisibleText(page, 'Choose from PS layers');
  await assertOverlayWithinPanel(page, '.attach-picker');
  await capture('responsive-min-supported-attach-picker.png');
  await assertNoBrokenImages(page);
}

async function themeLightScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  const panel = page.locator('.panel');
  await expectPanelTheme(panel, 'light');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await capture('theme-light-main.png');
  await assertNoBrokenImages(page);
}

async function themeDarkScenario({ page, url, capture }) {
  await openApp(page, url);
  await expectVisibleText(page, 'Mock Profile');
  const panel = page.locator('.panel');
  await expectPanelTheme(panel, 'dark');
  await assertPanelFillsRoot(page);
  await assertNoHorizontalScroll(page);
  await capture('theme-dark-main.png');
  await assertNoBrokenImages(page);
}

async function liveGeminiConnectionStrategyScenario({ page, url, capture, resetNetworkEvidence, listRequests }) {
  const fixture = requireLiveGeminiFixture();
  await openApp(page, url);
  await seedLiveGeminiProfile(page);
  await openApp(page, url);
  await page.getByTestId('main-providers-button').click();
  const providerRow = page.getByTestId(`provider-row-${fixture.profileId}`);
  await providerRow.waitFor({ state: 'visible', timeout: 10000 });
  const testButton = page.getByTestId('provider-profile-test-button');
  await providerRow.click();
  await testButton.waitFor({ state: 'visible', timeout: 10000 });
  resetNetworkEvidence();
  await clickControl(testButton, 'Test connection button');
  await page.waitForFunction(() => document.querySelector('[data-testid="provider-profile-test-button"]')?.disabled === false);
  await testButton.evaluate((button) => {
    if (button.disabled) {
      throw new Error('Test connection button stayed disabled after live probe.');
    }
  });
  const requestLog = listRequests();
  if (!requestLog.includes(`POST ${fixture.countTokensUrl}`)) {
    throw new Error(`Live Gemini probe did not call countTokens. Requests: ${requestLog.join(' | ')}`);
  }
  if (requestLog.some((line) => line === `GET ${fixture.legacyModelsUrl}`)) {
    throw new Error(`Live Gemini probe unexpectedly called legacy models.list endpoint ${fixture.legacyModelsUrl}.`);
  }
  await capture('live-gemini-connection-strategy.png');
}

async function liveComfyUiFrontendScenario(context) {
  return runLiveComfyUiGeneration(context);
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
    screenshotName: '02-provider-picker.png',
    assertions: ['profile dropdown empty', 'three provider choices visible', 'no wire configuration visible', 'no console/page/network errors'],
    run: firstRunProviderNavigationScenario,
  },
  {
    id: '02-add-provider-save-flow',
    name: 'Add provider save flow',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&scenario=seeded-document',
    screenshotName: '04-provider-list-after-save.png',
    assertions: ['dedicated OpenAI Images form visible', 'provider ready after save', 'secret hidden', 'no console/page/network errors'],
    run: addProviderSaveScenario,
  },
  {
    id: '03-provider-profile-field-allowlist',
    name: 'Gemini provider Profile field allowlist',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&scenario=seeded-document',
    screenshotName: '05-gemini-profile-fields.png',
    assertions: ['dedicated Gemini fields visible', 'legacy wire configuration absent', 'secret hidden', 'no console/page/network errors'],
    run: providerProfileAllowlistScenario,
  },
  {
    id: '04-provider-list-profile-edit',
    name: 'Provider list and profile edit',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '09-provider-profile-saved.png',
    assertions: ['provider list row visible', 'dedicated edit controls visible', 'alias saved', 'secret hidden', 'no console/page/network errors'],
    run: providerListAndEditScenario,
  },
  {
    id: '05-provider-profile-delete',
    name: 'Provider profile delete',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '12-settings-after-delete.png',
    assertions: ['delete confirmation visible', 'delete returns to providers list', 'no console/page/network errors'],
    run: providerDetailActionsScenario,
  },
  {
    id: '06-main-profile-model-menus',
    name: 'Main profile and model menus',
    tags: ['providers'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '15-main-single-model-profile.png',
    assertions: ['provider menu active option visible', 'single model value visible', 'single model selector disabled', 'no console/page/network errors'],
    run: mainProfileModelMenusScenario,
  },
  {
    id: '07-prompt-suggestion-generate',
    name: 'Prompt suggestions and send generate',
    tags: ['main-history'],
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: '17-main-generate-result.png',
    assertions: ['suggestion fills prompt', 'send enabled', 'generate result done', 'response text visible', 'preview visible', 'actions visible', 'no console/page/network errors'],
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
    assertions: ['history all filter visible', 'done filter visible', 'stale running projects to non-running', 'failed filter visible', 'back returns main', 'no console/page/network errors'],
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
    id: 'responsive-narrow-300x520',
    name: 'Responsive narrow width 300x520',
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
    id: 'responsive-settings-routes-300x420',
    name: 'Responsive settings routes 300x420',
    tags: ['responsive', 'settings-routes'],
    viewport: { width: 300, height: 420, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'settings-routes-300x420.png',
    assertions: ['provider, ComfyUI, and settings roots fit without horizontal scroll', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveSettingsRoutesScenario,
  },
  {
    id: 'responsive-settings-routes-360x600',
    name: 'Responsive settings routes 360x600',
    tags: ['responsive', 'settings-routes'],
    viewport: { width: 360, height: 600, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'settings-routes-360x600.png',
    assertions: ['provider, ComfyUI, and settings roots fit without horizontal scroll', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveSettingsRoutesScenario,
  },
  {
    id: 'responsive-settings-routes-420x680',
    name: 'Responsive settings routes 420x680',
    tags: ['responsive', 'settings-routes'],
    viewport: { width: 420, height: 680, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'settings-routes-420x680.png',
    assertions: ['provider, ComfyUI, and settings roots fit without horizontal scroll', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveSettingsRoutesScenario,
  },
  {
    id: 'responsive-settings-routes-520x720',
    name: 'Responsive settings routes 520x720',
    tags: ['responsive', 'settings-routes'],
    viewport: { width: 520, height: 720, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'settings-routes-520x720.png',
    assertions: ['provider, ComfyUI, and settings roots fit without horizontal scroll', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveSettingsRoutesScenario,
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
  {
    id: 'responsive-min-supported-300x420',
    name: 'Responsive minimum supported size 300x420',
    tags: ['responsive'],
    viewport: { width: 300, height: 420, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'responsive-min-supported-empty.png',
    assertions: ['panel fills root', 'no horizontal scroll', 'core controls visible', 'single primary scroll', 'no broken images', 'no console/page/network errors'],
    run: responsiveMinSupportedScenario,
  },
  {
    id: 'responsive-min-supported-overlay-300x420',
    name: 'Responsive minimum supported overlay containment 300x420',
    tags: ['responsive'],
    viewport: { width: 300, height: 420, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document',
    screenshotName: 'responsive-min-supported-profile-menu.png',
    assertions: ['profile menu within panel', 'attach picker within panel', 'no broken images', 'no console/page/network errors'],
    run: responsiveMinSupportedOverlayScenario,
  },
  {
    id: 'theme-light-390x720',
    name: 'Theme light main page',
    tags: ['responsive', 'theme'],
    viewport: { width: 390, height: 720, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document&theme=light',
    screenshotName: 'theme-light-main.png',
    assertions: ['panel has light theme override', 'panel fills root', 'no horizontal scroll', 'no broken images', 'no console/page/network errors'],
    run: themeLightScenario,
  },
  {
    id: 'theme-dark-390x720',
    name: 'Theme dark main page',
    tags: ['responsive', 'theme'],
    viewport: { width: 390, height: 720, deviceScaleFactor: 1 },
    path: '/index.html?testHarness=1&storage=memory&seedProfile=mock&scenario=seeded-document&theme=dark',
    screenshotName: 'theme-dark-main.png',
    assertions: ['panel has dark theme override', 'panel fills root', 'no horizontal scroll', 'no broken images', 'no console/page/network errors'],
    run: themeDarkScenario,
  },
  {
    id: 'comfyui-settings-connection-transaction',
    name: 'ComfyUI Settings connection transaction',
    tags: ['comfyui', 'comfyui-transaction'],
    path: `/index.html?testHarness=1&storage=indexed-db&db=${encodeURIComponent(`imagen-comfyui-transaction-${runId}`)}&resetStorage=1&scenario=seeded-document&comfyPersistenceDelayMs=350`,
    screenshotName: 'comfyui-connection-transaction.png',
    assertions: ['A to B edit supersedes', 'old active retained', 'B requires explicit Connect', 'phase copy visible', 'persistent Connected/Reconnect', 'workflow discovered', 'provisional iframe disposed', 'no horizontal scroll'],
    run: comfyUiConnectionTransactionScenario,
  },
  {
    id: 'live-provider-grsai-gemini-connection-strategy',
    name: 'Live Gemini connection strategy uses safe probe',
    tags: ['live-provider'],
    path: '/index.html',
    screenshotName: 'live-gemini-connection-strategy.png',
    assertions: ['fixture profile saved', 'UI test connection completed', 'safe probe used POST countTokens', 'legacy GET /models not used'],
    run: liveGeminiConnectionStrategyScenario,
  },
  {
    id: 'live-comfyui-frontend-d01-image-only',
    name: 'Live ComfyUI Settings connection and optional Frontend generation proof',
    tags: ['live-comfyui', 'comfyui-frontend'],
    path: '/index.html?testHarness=1&storage=indexed-db&db=imagen-comfyui-live-frontend&resetStorage=1&scenario=comfyui-image',
    screenshotName: 'live-comfyui-frontend.png',
    assertions: ['Settings Connect probes /system_stats', 'persistent Connected/Reconnect', 'workflow discovery', 'reconnect succeeds', 'invalid and unreachable targets retain old active', 'no stale provisional iframe'],
    run: liveComfyUiFrontendScenario,
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
    ...entries.map((entry) => `| ${entry.id} | ${entry.status} | ${entry.screenshotPath ?? ''} | ${entry.errorMessage ?? entry.note ?? 'Assertions passed'} |`),
    '',
  ];
  await writeFile(resolve(artifactRoot, 'README.md'), lines.join('\n'));
}

async function runScenario(browser, server, scenario) {
  const scenarioViewport = scenario.viewport ?? defaultViewport;
  const context = await browser.newContext({
    viewport: { width: scenarioViewport.width, height: scenarioViewport.height },
    deviceScaleFactor: scenarioViewport.deviceScaleFactor,
    locale: 'en-US',
  });
  await context.clearCookies();
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const requestLog = [];
  const retainedScreenshots = [];

  const isLiveComfyUiRemoteUrl = (value) => {
    if (!scenario.tags.includes('live-comfyui') || !liveComfyUiFixture || typeof value !== 'string') {
      return false;
    }
    try {
      return new URL(value).origin === liveComfyUiFixture.baseUrl;
    } catch {
      return value.includes(liveComfyUiFixture.baseUrl);
    }
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (isLiveComfyUiRemoteUrl(message.location().url)) {
        return;
      }
      consoleErrors.push(message.text());
    }
  });
  if (scenario.tags.includes('live-comfyui')) {
    const cdp = await context.newCDPSession(page);
    const executionContextOrigins = new Map();
    cdp.on('Runtime.executionContextCreated', ({ context: executionContext }) => {
      executionContextOrigins.set(executionContext.id, executionContext.origin);
    });
    cdp.on('Runtime.executionContextDestroyed', ({ executionContextId }) => {
      executionContextOrigins.delete(executionContextId);
    });
    cdp.on('Runtime.executionContextsCleared', () => {
      executionContextOrigins.clear();
    });
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      const sourceOrigin = executionContextOrigins.get(exceptionDetails.executionContextId);
      if (sourceOrigin === liveComfyUiFixture?.baseUrl) {
        return;
      }
      pageErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
    });
    await cdp.send('Runtime.enable');
  } else {
    page.on('pageerror', (error) => pageErrors.push(error.message));
  }
  page.on('request', (request) => {
    requestLog.push(`${request.method()} ${request.url()}`);
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (scenario.tags.includes('comfyui-transaction') && url.includes('/__chrome-e2e-comfy/attempt-a/')) {
      return;
    }
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
    requestLog.length = 0;
  };
  const listRequests = () => [...requestLog];
  const capture = async (screenshotName) => {
    if (!keepScreenshots) {
      return;
    }
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-motion-state]'))
      .every((element) => element.getAttribute('data-motion-state') === 'settled'));
    const screenshotPath = resolve(artifactRoot, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    retainedScreenshots.push(relativeFromApp(screenshotPath));
  };

  try {
    const result = await scenario.run({
      page,
      origin: server.origin,
      url,
      capture,
      resetNetworkEvidence,
      listRequests,
      fakeComfyUi: server.fakeComfyUi,
    });
    if (consoleErrors.length > 0) {
      throw new Error(`Console errors: ${consoleErrors.join(' | ')}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
    }
    if (failedRequests.length > 0) {
      throw new Error(`Failed same-origin requests: ${failedRequests.join(' | ')}`);
    }
    if (result?.status === 'partial') {
      entry.status = 'partial';
      entry.note = result.note;
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
  if (selected.some((scenario) => scenario.tags.includes('live-provider'))) {
    liveGeminiFixture = loadLiveGeminiFixture(await readRepoTestEnv());
  }
  if (selected.some((scenario) => scenario.tags.includes('live-comfyui'))) {
    const env = { ...await readRepoTestEnv(), ...process.env };
    liveComfyUiFixture = await loadLiveComfyUiFixture(env);
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
      viewport: defaultViewport,
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
      partial: entries.filter((entry) => entry.status === 'partial').length,
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
  for (const partial of entries.filter((entry) => entry.status === 'partial')) {
    console.warn(`${partial.id}: PARTIAL: ${partial.note}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

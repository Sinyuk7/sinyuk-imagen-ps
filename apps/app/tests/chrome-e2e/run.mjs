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
const viewport = { width: 390, height: 720, deviceScaleFactor: 1 };
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

async function smokeScenario({ page, origin }) {
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.locator('#root[data-runtime="chrome"][data-status="ok"]').waitFor({ timeout: 10000 });
  await expectVisibleText(page, 'No provider profile');
  await expectVisibleText(page, 'No model selected');
  await expectVisibleText(page, 'Current session');
  await expectVisibleText(page, 'Enter a prompt to submit a real job through the application layer.');
  await expectVisibleText(page, 'Blue glass perfume product photo');
  await expectVisibleText(page, 'Cyberpunk night reference edit');
  await page.locator('textarea[placeholder="Add a profile in Providers first"]').waitFor({ state: 'visible' });
  await page.locator('button.cmp-send').evaluate((button) => {
    if (!(button instanceof HTMLButtonElement) || !button.disabled) {
      throw new Error('Send button is not disabled in first-run smoke state.');
    }
  });
  await assertNoBrokenImages(page);
}

const scenarios = [
  {
    id: '00-smoke-main-empty',
    name: 'Chrome shell smoke',
    tags: ['smoke'],
    screenshotName: '00-smoke-main-empty.png',
    run: smokeScenario,
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
  const lines = [
    '# Chrome E2E Run',
    '',
    `- Run id: ${runId}`,
    `- Viewport: ${viewport.width}x${viewport.height} @${viewport.deviceScaleFactor}`,
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
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });
  await context.clearCookies();
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

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
  const entry = {
    id: scenario.id,
    name: scenario.name,
    tags: scenario.tags,
    viewport,
    url: `${server.origin}/index.html`,
    startedAt,
    status: 'passed',
    assertions: [],
    consoleErrorCount: 0,
  };

  try {
    await scenario.run({ page, origin: server.origin });
    if (consoleErrors.length > 0) {
      throw new Error(`Console errors: ${consoleErrors.join(' | ')}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
    }
    if (failedRequests.length > 0) {
      throw new Error(`Failed same-origin requests: ${failedRequests.join(' | ')}`);
    }
    entry.assertions.push('root chrome ok', 'first-run copy visible', 'send disabled', 'no broken images', 'no console/page/network errors');
    if (keepScreenshots) {
      const screenshotPath = resolve(artifactRoot, scenario.screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      entry.screenshotPath = relativeFromApp(screenshotPath);
    }
  } catch (error) {
    entry.status = 'failed';
    entry.errorMessage = error instanceof Error ? error.message : String(error);
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
    viewport,
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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const LEGACY_BAD_MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==';
const VALID_MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

function arrayLiteralForBase64(base64: string): string {
  return Array.from(Buffer.from(base64, 'base64')).join(',');
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

describe('UXP dist bundle safety', () => {
  beforeAll(() => {
    execFileSync(pnpmCommand(), ['run', 'build'], {
      cwd: resolve('.'),
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024,
    });
  });

  it('does not ship the legacy corrupted mock PNG in the host-loaded bundle', () => {
    const bundle = readFileSync(resolve('dist/assets/index.js'), 'utf8');

    expect(bundle).not.toContain(arrayLiteralForBase64(LEGACY_BAD_MOCK_PNG_BASE64));
    expect(bundle).toContain(arrayLiteralForBase64(VALID_MOCK_PNG_BASE64));
    expect(bundle).not.toContain('import.meta');
    expect(bundle).not.toContain('import("./focus-visible.js")');
  });

  it('builds a separate Chrome shell output without replacing the UXP manifest target', () => {
    const chromeOutput = resolve('dist/web/index.html');
    if (!existsSync(chromeOutput)) {
      return;
    }
    const chromeHtml = readFileSync(chromeOutput, 'utf8');
    const uxpHtml = readFileSync(resolve('dist/index.html'), 'utf8');
    const uxpBootstrap = readFileSync(resolve('dist/assets/uxp-bootstrap.js'), 'utf8');

    expect(chromeHtml).toContain('Imagen Chrome Harness');
    expect(chromeHtml).toContain('type="module"');
    expect(chromeHtml).toContain('./assets/index.js');
    expect(existsSync(resolve('public/assets/icons/settings.png'))).toBe(false);
    expect(uxpHtml).toContain('./assets/index.js');
    expect(uxpHtml).toContain('./assets/uxp-bootstrap.js');
    expect(uxpBootstrap).toContain('panel.bootstrap.html.loaded');
    expect(uxpHtml).not.toContain('<script>(function () {');
    expect(uxpHtml).not.toContain('type="module"');
  });

  it('ships UXP network all-domain permission in manifest v5 string form', () => {
    const sourceManifest = JSON.parse(readFileSync(resolve('public/manifest.json'), 'utf8')) as {
      featureFlags?: { CSSNextSupport?: unknown };
      requiredPermissions?: { network?: { domains?: unknown } };
    };
    const distManifest = JSON.parse(readFileSync(resolve('dist/manifest.json'), 'utf8')) as {
      featureFlags?: { CSSNextSupport?: unknown };
      requiredPermissions?: { network?: { domains?: unknown } };
    };

    expect(sourceManifest.featureFlags?.CSSNextSupport).toBe(true);
    expect(distManifest.featureFlags?.CSSNextSupport).toBe(true);
    expect(sourceManifest.requiredPermissions?.network?.domains).toBe('all');
    expect(distManifest.requiredPermissions?.network?.domains).toBe('all');
  });
});

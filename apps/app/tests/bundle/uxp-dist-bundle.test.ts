import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LEGACY_BAD_MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==';
const VALID_MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

function arrayLiteralForBase64(base64: string): string {
  return Array.from(Buffer.from(base64, 'base64')).join(',');
}

describe('UXP dist bundle safety', () => {
  it('does not ship the legacy corrupted mock PNG in the host-loaded bundle', () => {
    const bundle = readFileSync(resolve('dist/assets/index.js'), 'utf8');

    expect(bundle).not.toContain(arrayLiteralForBase64(LEGACY_BAD_MOCK_PNG_BASE64));
    expect(bundle).toContain(arrayLiteralForBase64(VALID_MOCK_PNG_BASE64));
  });

  it('builds a separate Chrome shell output without replacing the UXP manifest target', () => {
    const chromeOutput = resolve('dist/web/index.html');
    if (!existsSync(chromeOutput)) {
      return;
    }
    const chromeHtml = readFileSync(chromeOutput, 'utf8');
    const uxpHtml = readFileSync(resolve('dist/index.html'), 'utf8');

    expect(chromeHtml).toContain('Imagen Chrome Harness');
    expect(chromeHtml).toContain('type="module"');
    expect(chromeHtml).toContain('./assets/index.js');
    expect(existsSync(resolve('dist/web/assets/icons/settings.png'))).toBe(true);
    expect(uxpHtml).toContain('<script defer src="./assets/index.js"></script>');
  });

  it('ships UXP network all-domain permission in manifest v5 string form', () => {
    const sourceManifest = JSON.parse(readFileSync(resolve('public/manifest.json'), 'utf8')) as {
      requiredPermissions?: { network?: { domains?: unknown } };
    };
    const distManifest = JSON.parse(readFileSync(resolve('dist/manifest.json'), 'utf8')) as {
      requiredPermissions?: { network?: { domains?: unknown } };
    };

    expect(sourceManifest.requiredPermissions?.network?.domains).toBe('all');
    expect(distManifest.requiredPermissions?.network?.domains).toBe('all');
  });
});

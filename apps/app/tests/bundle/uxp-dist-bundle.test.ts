import { readFileSync } from 'node:fs';
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
});

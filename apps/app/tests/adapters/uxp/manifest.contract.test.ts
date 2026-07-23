import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface UxpManifestPermissions {
  readonly network?: { readonly domains?: unknown };
  readonly webview?: {
    readonly allow?: unknown;
    readonly domains?: unknown;
    readonly enableMessageBridge?: unknown;
  };
}

describe('UXP ComfyUI manifest permissions', () => {
  it('keeps network and WebView access as separate explicit gates', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'manifest.json'), 'utf8'),
    ) as { readonly requiredPermissions?: UxpManifestPermissions };

    expect(manifest.requiredPermissions?.network?.domains).toBe('all');
    expect(manifest.requiredPermissions?.webview).toEqual(expect.objectContaining({
      allow: 'yes',
      domains: 'all',
      enableMessageBridge: 'localAndRemote',
    }));
  });
});

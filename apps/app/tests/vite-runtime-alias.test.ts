import chromeConfig from '../vite.chrome.config';
import uxpConfig from '../vite.uxp.config';
import { describe, expect, it } from 'vitest';

interface AliasEntry {
  readonly find: string;
  readonly replacement: string;
}

function normalizedAliases(config: { resolve?: { alias?: unknown } }): readonly AliasEntry[] {
  const alias = config.resolve?.alias;
  if (Array.isArray(alias)) {
    return alias.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const find = (entry as { find?: unknown }).find;
      const replacement = (entry as { replacement?: unknown }).replacement;
      return typeof find === 'string' && typeof replacement === 'string'
        ? [{ find, replacement }]
        : [];
    });
  }

  if (!alias || typeof alias !== 'object') {
    return [];
  }

  return Object.entries(alias).flatMap(([find, replacement]) =>
    typeof replacement === 'string' ? [{ find, replacement }] : [],
  );
}

describe('Dual-runtime SWC resolution', () => {
  it('aliases shared SWC imports to UXP wrappers only in the UXP build', () => {
    const uxpAliasMap = new Map(normalizedAliases(uxpConfig).map((entry) => [entry.find, entry.replacement]));
    const chromeAliasMap = new Map(normalizedAliases(chromeConfig).map((entry) => [entry.find, entry.replacement]));
    const uxpPlugins = Array.isArray(uxpConfig.plugins) ? uxpConfig.plugins : [];
    const chromePlugins = Array.isArray(chromeConfig.plugins) ? chromeConfig.plugins : [];

    expect(uxpAliasMap.get('@spectrum-web-components/button')).toBe('@swc-uxp-wrappers/button');
    expect(uxpAliasMap.get('@spectrum-web-components/checkbox')).toBe('@swc-uxp-wrappers/checkbox');
    expect(uxpAliasMap.get('@spectrum-web-components/textfield')).toBe('@swc-uxp-wrappers/textfield');

    expect(chromeAliasMap.has('@spectrum-web-components/button')).toBe(false);
    expect(chromeAliasMap.has('@spectrum-web-components/checkbox')).toBe(false);
    expect(chromeAliasMap.has('@spectrum-web-components/textfield')).toBe(false);
    expect(uxpPlugins.some((plugin) => plugin?.name === 'imagen-ps-uxp-focus-visible-compat')).toBe(true);
    expect(chromePlugins.some((plugin) => plugin?.name === 'imagen-ps-uxp-focus-visible-compat')).toBe(false);
  });
});

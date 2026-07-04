import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  verifyArtifact,
  matchGlob,
  checkAllowlist,
  checkDenylist,
  scanSourceMap,
  scanSecret,
  scanPathLeak,
  scanDevLeak,
  inspectStaging,
} from '../scripts/lib/verify-artifact.mjs';
import { COPYRIGHT_BANNER, AI_NOTICE } from '../scripts/lib/legal-banner.mjs';

// 复用正式 banner 常量做 verifier 断言
const BANNER = COPYRIGHT_BANNER;
const AI = AI_NOTICE;

describe('verify-artifact', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'imagen-verify-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('matchGlob', () => {
    it('matches exact file', () => {
      expect(matchGlob('manifest.json', 'manifest.json')).toBe(true);
      expect(matchGlob('manifest.json', 'index.html')).toBe(false);
    });

    it('matches assets/** recursively', () => {
      expect(matchGlob('assets/**', 'assets/index.js')).toBe(true);
      expect(matchGlob('assets/**', 'assets/sub/foo.js')).toBe(true);
      expect(matchGlob('assets/**', 'src/index.js')).toBe(false);
    });

    it('matches wildcard within a segment', () => {
      expect(matchGlob('assets/[name].js', 'assets/[name].js')).toBe(true);
    });
  });

  describe('checkAllowlist', () => {
    it('passes for allowlist files', () => {
      expect(checkAllowlist(['manifest.json', 'index.html', 'assets/index.js'])).toEqual([]);
    });

    it('flags non-allowlist files', () => {
      expect(checkAllowlist(['src/foo.ts', 'tests/x.test.ts'])).toEqual(['src/foo.ts', 'tests/x.test.ts']);
    });
  });

  describe('checkDenylist', () => {
    it('flags .map files', () => {
      expect(checkDenylist(['assets/index.js.map']).length).toBeGreaterThan(0);
    });

    it('flags .env files', () => {
      expect(checkDenylist(['.env', '.env.local']).length).toBeGreaterThan(0);
    });

    it('flags TS source files', () => {
      expect(checkDenylist(['src/index.ts', 'foo.tsx']).length).toBeGreaterThan(0);
    });

    it('flags forbidden dirs', () => {
      expect(checkDenylist(['src/index.js']).length).toBeGreaterThan(0);
      expect(checkDenylist(['tests/x.js']).length).toBeGreaterThan(0);
    });

    it('passes clean production files', () => {
      expect(checkDenylist(['manifest.json', 'assets/index.js'])).toEqual([]);
    });
  });

  describe('scanSourceMap', () => {
    it('detects sourceMappingURL comment', () => {
      expect(scanSourceMap('code\n//# sourceMappingURL=index.js.map')).toContain('sourceMappingURL comment');
    });

    it('detects css sourceMappingURL comment', () => {
      expect(scanSourceMap('/*# sourceMappingURL=index.css.map */')).toContain('sourceMappingURL css comment');
    });

    it('detects sourcesContent', () => {
      expect(scanSourceMap('var x = {"sourcesContent":["abc"]}')).toContain('sourcesContent');
    });

    it('passes clean code', () => {
      expect(scanSourceMap('function f(){return 1}')).toEqual([]);
    });
  });

  describe('scanSecret', () => {
    it('detects private key header', () => {
      expect(scanSecret('-----BEGIN RSA PRIVATE KEY-----')).toContain('private-key-header');
    });

    it('detects bearer token', () => {
      expect(scanSecret('Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890')).toContain('bearer-token');
    });

    it('detects sk- api key', () => {
      expect(scanSecret('key = sk-abcdefghijklmnopqrstuvwxyz1234')).toContain('generic-api-key-sk');
    });

    it('does not flag short sk- prefixes', () => {
      expect(scanSecret('sk-abcd')).toEqual([]);
    });

    it('passes clean code', () => {
      expect(scanSecret('function f(){return 1}')).toEqual([]);
    });
  });

  describe('scanPathLeak', () => {
    it('detects /Users/ path', () => {
      expect(scanPathLeak('at /Users/alice/project/file.js')).toContain('unix-users-path');
    });

    it('detects /home/ path', () => {
      expect(scanPathLeak('at /home/bob/file.js')).toContain('unix-home-path');
    });

    it('detects windows drive path', () => {
      expect(scanPathLeak('at C:\\Users\\alice\\file.js')).toContain('windows-drive-path');
    });

    it('does not flag a normal https URL', () => {
      expect(scanPathLeak('https://example.com/path')).toEqual([]);
    });
  });

  describe('scanDevLeak', () => {
    it('detects react development build marker', () => {
      expect(scanDevLeak('react-dom.development.js')).toContain('react-development-build');
    });

    it('detects vite hmr runtime', () => {
      expect(scanDevLeak('importMetaHot')).toContain('vite-hmr-runtime');
    });

    it('does not flag __REACT_DEVTOOLS_GLOBAL_HOOK__ (present in prod builds)', () => {
      expect(scanDevLeak('__REACT_DEVTOOLS_GLOBAL_HOOK__')).toEqual([]);
    });

    it('audits localhost url without failing', () => {
      const r = scanDevLeak('http://localhost:5173/');
      expect(r.some((x) => x.includes('localhost-url'))).toBe(true);
    });
  });

  describe('verifyArtifact fixtures', () => {
    function writeValidManifest(dir: string) {
      writeFileSync(
        join(dir, 'manifest.json'),
        JSON.stringify({
          manifestVersion: 5,
          id: 'com.imagen-ps.panel',
          name: 'Imagen PS',
          version: '1.0.0',
          main: 'index.html',
          host: { app: 'PS', minVersion: '26.1.0' },
          requiredPermissions: { network: { domains: 'all' }, localFileSystem: 'request' },
          entrypoints: [{ type: 'panel', id: 'imagen-ps-panel' }],
        }),
      );
    }

    function writeValidIndex(dir: string) {
      writeFileSync(join(dir, 'index.html'), '<!doctype html><html></html>');
      mkdirSync(join(dir, 'assets'), { recursive: true });
      writeFileSync(join(dir, 'assets/index.js'), BANNER + '\n' + AI + '\nfunction main(){}');
      writeFileSync(join(dir, 'assets/uxp-bootstrap.js'), BANNER + '\n(function(){})()');
    }

    function writeLegal(dir: string) {
      writeFileSync(join(dir, 'LICENSE.txt'), 'MPL-2.0');
      writeFileSync(join(dir, 'THIRD_PARTY_NOTICES.txt'), 'notices');
      writeFileSync(join(dir, 'BUILD_INFO.json'), JSON.stringify({ version: '1.0.0', buildId: '1.0.0+abcdef1', commit: 'abcdef1', channel: 'production', name: 'Imagen PS' }));
    }

    it('passes a valid artifact', () => {
      writeValidManifest(tmp);
      writeValidIndex(tmp);
      writeLegal(tmp);
      const result = verifyArtifact({ stagingRoot: tmp, expectedVersion: '1.0.0', copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations).toEqual([]);
      expect(result.aiNoticeCount).toBe(1);
      expect(result.bannerCoverage).toBe(result.bannerTotal);
    });

    it('rejects a .map file', () => {
      writeValidManifest(tmp);
      writeValidIndex(tmp);
      writeLegal(tmp);
      writeFileSync(join(tmp, 'assets/index.js.map'), '{"version":3}');
      const result = verifyArtifact({ stagingRoot: tmp, expectedVersion: '1.0.0', copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('.map'))).toBe(true);
    });

    it('rejects inline sourceMappingURL in JS', () => {
      writeValidManifest(tmp);
      writeLegal(tmp);
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      writeFileSync(join(tmp, 'assets/index.js'), BANNER + '\n' + AI + '\n//# sourceMappingURL=index.js.map');
      writeFileSync(join(tmp, 'index.html'), '<html></html>');
      const result = verifyArtifact({ stagingRoot: tmp, expectedVersion: '1.0.0', copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('sourceMappingURL'))).toBe(true);
    });

    it('rejects a .env file', () => {
      writeValidManifest(tmp);
      writeValidIndex(tmp);
      writeLegal(tmp);
      writeFileSync(join(tmp, '.env'), 'SECRET=abc');
      const result = verifyArtifact({ stagingRoot: tmp, copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('.env'))).toBe(true);
    });

    it('rejects TS source file', () => {
      writeValidManifest(tmp);
      writeValidIndex(tmp);
      writeLegal(tmp);
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, 'src/index.ts'), 'export const x = 1');
      const result = verifyArtifact({ stagingRoot: tmp, copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('src/'))).toBe(true);
    });

    it('rejects absolute path leak in JS', () => {
      writeValidManifest(tmp);
      writeLegal(tmp);
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      writeFileSync(join(tmp, 'assets/index.js'), BANNER + '\n' + AI + '\n// /Users/leaked/project/src/foo.js');
      writeFileSync(join(tmp, 'index.html'), '<html></html>');
      const result = verifyArtifact({ stagingRoot: tmp, copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('unix-users-path'))).toBe(true);
    });

    it('rejects a leaked secret and does not echo the secret value', () => {
      writeValidManifest(tmp);
      writeLegal(tmp);
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      const secretVal = 'sk-abcdefghijklmnopqrstuvwxyz1234567890XYZ';
      writeFileSync(join(tmp, 'assets/index.js'), BANNER + '\n' + AI + '\nvar k="' + secretVal + '";');
      writeFileSync(join(tmp, 'index.html'), '<html></html>');
      const result = verifyArtifact({ stagingRoot: tmp, copyrightBanner: BANNER, aiNotice: AI });
      const secretViolation = result.violations.find((v) => v.includes('generic-api-key-sk'));
      expect(secretViolation).toBeTruthy();
      // 报错信息不得回显完整 secret 原值
      expect(secretViolation).not.toContain(secretVal);
    });

    it('rejects missing manifest entry file', () => {
      writeValidManifest(tmp);
      writeLegal(tmp);
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      writeFileSync(join(tmp, 'assets/index.js'), BANNER + '\n' + AI + '\nfunction(){}');
      // manifest.main = index.html but we don't write it
      const result = verifyArtifact({ stagingRoot: tmp, expectedVersion: '1.0.0', copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('manifest main'))).toBe(true);
    });

    it('rejects missing banner in a JS chunk', () => {
      writeValidManifest(tmp);
      writeLegal(tmp);
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      writeFileSync(join(tmp, 'assets/index.js'), AI + '\nfunction(){}'); // no copyright banner
      writeFileSync(join(tmp, 'index.html'), '<html></html>');
      const result = verifyArtifact({ stagingRoot: tmp, copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('copyright banner'))).toBe(true);
    });

    it('rejects AI notice injected more than once', () => {
      writeValidManifest(tmp);
      writeLegal(tmp);
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      writeFileSync(join(tmp, 'assets/index.js'), BANNER + '\n' + AI + AI + '\nfunction(){}');
      writeFileSync(join(tmp, 'assets/uxp-bootstrap.js'), BANNER + '\n(function(){})()');
      writeFileSync(join(tmp, 'index.html'), '<html></html>');
      const result = verifyArtifact({ stagingRoot: tmp, copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('AI notice injected') && v.includes('2'))).toBe(true);
    });

    it('rejects AI notice missing entirely', () => {
      writeValidManifest(tmp);
      writeLegal(tmp);
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      writeFileSync(join(tmp, 'assets/index.js'), BANNER + '\nfunction(){}');
      writeFileSync(join(tmp, 'assets/uxp-bootstrap.js'), BANNER + '\n(function(){})()');
      writeFileSync(join(tmp, 'index.html'), '<html></html>');
      const result = verifyArtifact({ stagingRoot: tmp, copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('AI notice missing'))).toBe(true);
    });

    it('rejects an allowlist-violating file', () => {
      writeValidManifest(tmp);
      writeValidIndex(tmp);
      writeLegal(tmp);
      writeFileSync(join(tmp, 'README.md'), 'draft');
      const result = verifyArtifact({ stagingRoot: tmp, copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('allowlist') && v.includes('README.md'))).toBe(true);
    });

    it('rejects version mismatch between manifest and BUILD_INFO', () => {
      writeValidManifest(tmp);
      writeValidIndex(tmp);
      writeLegal(tmp);
      const result = verifyArtifact({ stagingRoot: tmp, expectedVersion: '2.0.0', copyrightBanner: BANNER, aiNotice: AI });
      expect(result.violations.some((v) => v.includes('version'))).toBe(true);
    });
  });

  describe('inspectStaging', () => {
    it('returns files and denylist violations', () => {
      writeFileSync(join(tmp, 'manifest.json'), '{}');
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, 'src/leak.ts'), 'x');
      const { files, violations } = inspectStaging(tmp);
      expect(files).toContain('manifest.json');
      expect(files).toContain('src/leak.ts');
      expect(violations.length).toBeGreaterThan(0);
    });
  });
});

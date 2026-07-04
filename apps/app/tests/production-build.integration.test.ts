import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyArtifact, collectFiles } from '../scripts/lib/verify-artifact.mjs';
import { COPYRIGHT_BANNER, AI_NOTICE } from '../scripts/lib/legal-banner.mjs';

const APP_DIR = resolve(__dirname, '..');
const STAGING_DIR = join(APP_DIR, 'release/uxp-production');

/**
 * Production build 集成测试：真实执行一次 production build 并验证稳定 contract。
 * 不测试 minified 文件精确全文或 hash；只测试 contract。
 *
 * 注：本测试会真实构建，较慢。归类为 development test（mock-only），因为不调用
 * 真实 provider/网络，只做本地 bundling + 产物校验。
 */
describe('production build integration', () => {
  // 共享一次构建结果，避免重复构建
  let built = false;
  function ensureBuild() {
    if (built) return;
    const result = spawnSync('pnpm', ['run', 'build:production'], {
      cwd: APP_DIR,
      stdio: 'inherit',
      env: { ...process.env, IMAGEN_SKIP_APP_BUILD_DEPS: '1' },
    });
    if (result.status !== 0) {
      throw new Error(`production build failed with status ${result.status}`);
    }
    built = true;
  }

  it('staging dir exists and was cleaned (no stale files)', () => {
    ensureBuild();
    expect(existsSync(STAGING_DIR)).toBe(true);
    // 不应存在 raw 目录泄漏到 staging
    const files = collectFiles(STAGING_DIR);
    expect(files.some((f) => f.includes('.uxp-production-raw'))).toBe(false);
  });

  it('contains required files', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    expect(files).toContain('manifest.json');
    expect(files).toContain('index.html');
    expect(files).toContain('BUILD_INFO.json');
    expect(files).toContain('LICENSE.txt');
    expect(files).toContain('THIRD_PARTY_NOTICES.txt');
    expect(files.some((f) => f.endsWith('.js'))).toBe(true);
  });

  it('does not contain source maps', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    expect(files.some((f) => f.endsWith('.map'))).toBe(false);
  });

  it('does not contain sourceMappingURL in emitted JS', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    for (const f of files) {
      if (!f.endsWith('.js') && !f.endsWith('.css')) continue;
      const text = readFileSync(join(STAGING_DIR, f), 'utf8');
      expect(text).not.toMatch(/sourceMappingURL/);
    }
  });

  it('does not contain TS source / tests / fixtures / env', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    expect(files.some((f) => f.endsWith('.ts') || f.endsWith('.tsx'))).toBe(false);
    expect(files.some((f) => /\.env/i.test(f))).toBe(false);
    expect(files.some((f) => f.includes('test') || f.includes('fixture') || f.includes('spec'))).toBe(false);
    expect(files.some((f) => f.startsWith('src/'))).toBe(false);
  });

  it('JS is minified (esbuild mangled identifiers present, no readable multi-line source)', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    const js = files.filter((f) => f.endsWith('.js'));
    for (const f of js) {
      const text = readFileSync(join(STAGING_DIR, f), 'utf8');
      if (f.endsWith('index.js')) {
        // 主 bundle 应被 esbuild minify：出现短 mangled 标识符
        expect(text).toMatch(/function [A-Za-z_$][A-Za-z0-9_$]{0,3}\(/);
        // 不应出现未压缩的 readable 多行源码块（连续多行 function 声明）
        expect(text).not.toMatch(/function [a-z][a-zA-Z]{8,}\s*\([^)]*\)\s*{\n/g);
      }
    }
  });

  it('legal files are present and non-empty', () => {
    ensureBuild();
    const license = readFileSync(join(STAGING_DIR, 'LICENSE.txt'), 'utf8');
    expect(license.trim().length).toBeGreaterThan(0);
    expect(license).toContain('Mozilla Public License');
    const notices = readFileSync(join(STAGING_DIR, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
    expect(notices.trim().length).toBeGreaterThan(0);
    expect(notices).toContain('THIRD-PARTY NOTICES');
  });

  it('manifest is loadable and version matches BUILD_INFO', () => {
    ensureBuild();
    const manifest = JSON.parse(readFileSync(join(STAGING_DIR, 'manifest.json'), 'utf8'));
    const info = JSON.parse(readFileSync(join(STAGING_DIR, 'BUILD_INFO.json'), 'utf8'));
    expect(manifest.version).toBe(info.version);
    expect(manifest.manifestVersion).toBe(5);
    expect(manifest.host?.app).toBe('PS');
  });

  it('copyright banner present in every emitted JS/CSS', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    const targets = files.filter((f) => f.endsWith('.js') || f.endsWith('.css'));
    expect(targets.length).toBeGreaterThan(0);
    for (const f of targets) {
      const text = readFileSync(join(STAGING_DIR, f), 'utf8');
      expect(text).toContain(COPYRIGHT_BANNER);
    }
  });

  it('AI notice injected exactly once across all files', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    let total = 0;
    for (const f of files) {
      const abs = join(STAGING_DIR, f);
      if (!statSync(abs).isFile()) continue;
      try {
        const text = readFileSync(abs, 'utf8');
        let idx = text.indexOf(AI_NOTICE);
        while (idx >= 0) {
          total += 1;
          idx = text.indexOf(AI_NOTICE, idx + AI_NOTICE.length);
        }
      } catch {
        // binary file
      }
    }
    expect(total).toBe(1);
  });

  it('artifact verifier passes on the real staging', () => {
    ensureBuild();
    const result = verifyArtifact({
      stagingRoot: STAGING_DIR,
      expectedVersion: JSON.parse(readFileSync(join(STAGING_DIR, 'BUILD_INFO.json'), 'utf8')).version,
      copyrightBanner: COPYRIGHT_BANNER,
      aiNotice: AI_NOTICE,
    });
    if (result.violations.length > 0) {
      console.error('verifier violations:\n  - ' + result.violations.join('\n  - '));
    }
    expect(result.violations).toEqual([]);
  });

  it('does not leak absolute local paths', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    for (const f of files) {
      const abs = join(STAGING_DIR, f);
      if (!statSync(abs).isFile()) continue;
      const ext = f.split('.').pop();
      if (!['js', 'css', 'html', 'json', 'txt', 'mjs'].includes(ext ?? '')) continue;
      const text = readFileSync(abs, 'utf8');
      expect(text).not.toMatch(/\/Users\/[A-Za-z0-9._-]+\//);
      expect(text).not.toMatch(/\/home\/[A-Za-z0-9._-]+\//);
    }
  });

  it('does not inject process.env or unknown VITE_ vars into the bundle', () => {
    ensureBuild();
    const files = collectFiles(STAGING_DIR);
    for (const f of files) {
      const abs = join(STAGING_DIR, f);
      if (!statSync(abs).isFile()) continue;
      const ext = f.split('.').pop();
      if (!['js', 'css', 'html'].includes(ext ?? '')) continue;
      const text = readFileSync(abs, 'utf8');
      expect(text).not.toMatch(/\bprocess\.env\b/);
      expect(text).not.toMatch(/\bimport\.meta\.env\b/);
      expect(text).not.toMatch(/\bVITE_[A-Z][A-Z0-9_]*\b/);
    }
  });

  it('contains ARTIFACT_MANIFEST.json with per-file sha256', () => {
    ensureBuild();
    const manifestPath = join(STAGING_DIR, 'ARTIFACT_MANIFEST.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.version).toBe('1');
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files.length).toBeGreaterThan(0);
    // 不应包含自身
    expect(manifest.files.some((e: any) => e.path === 'ARTIFACT_MANIFEST.json')).toBe(false);
    for (const entry of manifest.files) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof entry.size).toBe('number');
    }
  });

  it('ARTIFACT_MANIFEST is consistent with actual staging files (verifyAgainstManifest passes)', async () => {
    ensureBuild();
    const { verifyAgainstManifest } = await import('../scripts/lib/verify-artifact.mjs');
    const result = verifyAgainstManifest(STAGING_DIR);
    if (result.violations.length > 0) {
      console.error('manifest violations:\n  - ' + result.violations.join('\n  - '));
    }
    expect(result.violations).toEqual([]);
    expect(result.checked).toBeGreaterThan(0);
  });
});

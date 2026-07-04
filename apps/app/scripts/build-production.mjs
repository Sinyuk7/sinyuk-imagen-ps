#!/usr/bin/env node
// Production build 编排脚本（验证后原子晋升）。
//
// 合约：
//   1. 清理旧 raw 与 temp 目录；保留上一次已验证 staging 直到新产物通过验证。
//   2. 执行 Production bundle（sourcemap off、minify、banner 注入、bundled-packages 收集）。
//   3. 按 allowlist 拷贝静态资源到 temp staging。
//   4. 生成法律声明（LICENSE.txt、THIRD_PARTY_NOTICES.txt 基于 bundled-packages.json）。
//   5. 生成 build metadata（BUILD_INFO.json）。
//   6. 执行 artifact verification（含 build-env allowlist 扫描）。
//   7. 验证通过后生成 ARTIFACT_MANIFEST.json，原子 rename temp → staging。
//   8. 失败时删除 temp，保留旧 staging，返回非零 exit code。
//
// 用法：node apps/app/scripts/build-production.mjs
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { writeBuildInfoFile } from './lib/build-metadata.mjs';
import { writeThirdPartyNotices } from './lib/legal-notices.mjs';
import { COPYRIGHT_BANNER, AI_NOTICE } from './lib/legal-banner.mjs';
import {
  verifyArtifact,
  reportArtifact,
  generateArtifactManifest,
  serializeArtifactManifest,
  STAGING_ALLOWLIST,
  matchGlob,
} from './lib/verify-artifact.mjs';
import { auditViteEnvConfig, ALLOWED_CLIENT_DEFINES } from './lib/build-env-allowlist.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(APP_DIR, '..', '..');
const MANIFEST_PATH = resolve(APP_DIR, 'public/manifest.json');
const LICENSE_PATH = resolve(REPO_ROOT, 'LICENSE');
const RAW_OUT_DIR = resolve(APP_DIR, 'release/.uxp-production-raw');
const STAGING_DIR = resolve(APP_DIR, 'release/uxp-production');
const TEMP_STAGING_DIR = resolve(APP_DIR, `release/.tmp-production-${randomBytes(4).toString('hex')}`);
const BUNDLED_PACKAGES_PATH = resolve(RAW_OUT_DIR, 'bundled-packages.json');
const LICENSE_OVERRIDES_PATH = resolve(SCRIPT_DIR, 'lib/license-overrides.json');

function fail(msg, code = 1) {
  console.error(`\x1b[31m[production]\x1b[0m ${msg}`);
  process.exit(code);
}

function log(msg) {
  console.error(`\x1b[36m[production]\x1b[0m ${msg}`);
}

/**
 * 清理 raw 与 temp；保留旧 staging（原子晋升后才替换）。
 */
export function cleanRawAndTemp() {
  for (const dir of [RAW_OUT_DIR, TEMP_STAGING_DIR]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(TEMP_STAGING_DIR, { recursive: true });
}

/**
 * 执行 theme 生成（host surface）+ vite production build。
 */
export function runBundle() {
  log('generating theme (host surface)...');
  const theme = spawnSync('pnpm', ['run', 'theme:generate'], { cwd: APP_DIR, stdio: 'inherit' });
  if (theme.status !== 0) fail('theme generation failed');
  log('running vite production build...');
  const build = spawnSync('pnpm', ['exec', 'vite', 'build', '--config', 'vite.uxp.production.config.ts'], {
    cwd: APP_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (build.status !== 0) fail('vite production build failed');
  if (!existsSync(RAW_OUT_DIR)) fail(`raw build output missing: ${RAW_OUT_DIR}`);
  if (!existsSync(BUNDLED_PACKAGES_PATH)) fail(`bundled-packages.json missing at ${BUNDLED_PACKAGES_PATH} (bundledPackagesPlugin did not run)`);
}

/**
 * 按 allowlist 把 raw 产物拷贝到 temp staging。
 */
export function stageAllowlist() {
  log('staging allowlist files...');
  const files = collectFilesRelative(RAW_OUT_DIR);
  let staged = 0;
  for (const rel of files) {
    const allowed = STAGING_ALLOWLIST.some((p) => matchGlob(p, rel));
    if (!allowed) continue;
    const src = join(RAW_OUT_DIR, rel);
    const dst = join(TEMP_STAGING_DIR, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true });
    staged += 1;
  }
  log(`staged ${staged} file(s)`);
  prunePlaceholderFiles(TEMP_STAGING_DIR);
  if (staged === 0) fail('no files staged — raw build may be empty');
}

/**
 * 删除 staging 中的占位文件（.gitkeep 等）。
 * @param {string} root
 */
function prunePlaceholderFiles(root) {
  const files = collectFilesRelative(root);
  for (const rel of files) {
    if (/\.gitkeep$/i.test(rel) || /^\.keep$/i.test(rel)) {
      rmSync(join(root, rel), { force: true });
    }
  }
}

/**
 * 递归收集相对文件路径（posix）。
 * @param {string} root
 * @returns {string[]}
 */
function collectFilesRelative(root) {
  const out = [];
  function walk(dir, relBase) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out.push(rel);
    }
  }
  walk(root, '');
  return out.sort();
}

/**
 * 生成法律声明文件：LICENSE.txt 与 THIRD_PARTY_NOTICES.txt。
 * @returns {{unresolved:{name:string,version:string}[]}}
 */
export function writeLegalNotices() {
  log('writing LICENSE.txt...');
  if (!existsSync(LICENSE_PATH)) fail(`LICENSE missing at ${LICENSE_PATH}`);
  const licenseText = readFileSync(LICENSE_PATH, 'utf8');
  writeFileSync(join(TEMP_STAGING_DIR, 'LICENSE.txt'), licenseText);

  log('generating THIRD_PARTY_NOTICES.txt from bundled-packages.json...');
  const result = writeThirdPartyNotices({
    appDir: APP_DIR,
    bundledPackagesPath: BUNDLED_PACKAGES_PATH,
    overridePath: LICENSE_OVERRIDES_PATH,
    outPath: join(TEMP_STAGING_DIR, 'THIRD_PARTY_NOTICES.txt'),
  });
  log(`third-party notices: ${result.entries} entries, ${result.unresolved.length} unresolved`);
  return { unresolved: result.unresolved };
}

/**
 * 生成 BUILD_INFO.json。
 * @returns {object} info
 */
export function writeBuildMetadata() {
  log('writing BUILD_INFO.json...');
  const info = writeBuildInfoFile({
    manifestPath: MANIFEST_PATH,
    repoRoot: REPO_ROOT,
    outPath: join(TEMP_STAGING_DIR, 'BUILD_INFO.json'),
    sourceDateEpoch: process.env.SOURCE_DATE_EPOCH,
  });
  log(`version=${info.version} buildId=${info.buildId} commit=${info.commit}${info.dirty ? ' (dirty)' : ''}`);
  return info;
}

/**
 * 运行 artifact verifier（对 temp staging）。
 * @param {object} info  build info
 */
export function runVerification(info) {
  log('verifying production artifact...');
  const result = verifyArtifact({
    stagingRoot: TEMP_STAGING_DIR,
    expectedVersion: info.version,
    copyrightBanner: COPYRIGHT_BANNER,
    aiNotice: AI_NOTICE,
  });
  const report = result.report;
  if (report?.files) {
    log(
      `artifact: ${report.files} files, ${(report.totalBytes / 1024).toFixed(1)} KB, ` +
        `JS ${(report.jsBytes / 1024).toFixed(1)} KB, CSS ${(report.cssBytes / 1024).toFixed(1)} KB, ` +
        `${report.chunks} chunk(s), largest=${report.largest.name}`,
    );
  }
  log(`ai-notice count=${result.aiNoticeCount}, banner coverage=${result.bannerCoverage}/${result.bannerTotal}`);
  if (result.violations.length > 0) {
    for (const v of result.violations) fail(`verifier: ${v}`);
    rmSync(TEMP_STAGING_DIR, { recursive: true, force: true });
    process.exit(1);
  }
  log('artifact verification passed.');
}

/**
 * 验证通过后：生成 ARTIFACT_MANIFEST.json，原子 rename temp → staging。
 */
export function atomicPromote() {
  log('generating ARTIFACT_MANIFEST.json...');
  const manifest = generateArtifactManifest(TEMP_STAGING_DIR);
  writeFileSync(join(TEMP_STAGING_DIR, 'ARTIFACT_MANIFEST.json'), serializeArtifactManifest(manifest));
  // 原子替换旧 staging
  const backup = STAGING_DIR + '.old';
  if (existsSync(STAGING_DIR)) {
    rmSync(backup, { force: true });
    renameSync(STAGING_DIR, backup);
  }
  renameSync(TEMP_STAGING_DIR, STAGING_DIR);
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  log(`atomic promotion complete: ${STAGING_DIR}`);
}

/**
 * 打印 staging 文件树。
 */
export function printTree() {
  const report = reportArtifact(STAGING_DIR);
  console.error('staging tree:\n' + report.tree);
}

async function main() {
  cleanRawAndTemp();
  runBundle();
  stageAllowlist();
  const legal = writeLegalNotices();
  const info = writeBuildMetadata();
  runVerification(info);
  atomicPromote();
  printTree();
  if (legal.unresolved.length > 0) {
    fail(`third-party notices has ${legal.unresolved.length} unresolved license(s): ${legal.unresolved.map((u) => `${u.name}@${u.version}`).join(', ')}. Resolve via ${LICENSE_OVERRIDES_PATH} or add LICENSE to the package.`);
  }
  console.error(`\n\x1b[32m[production]\x1b[0m production build complete: ${STAGING_DIR}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => fail(err.stack || err.message));
}

#!/usr/bin/env node
// .ccx 打包预检与 post-package 检查（验证后写 sidecar）。
//
// 合约：
//   1. 不自己伪造 ZIP 并声称等价于正式 .ccx；Adobe .ccx 只能由 UDT 或 Adobe CLI 生成。
//   2. pre-package：确认 staging 存在、verifier 通过、准备好供 UDT 加载。
//   3. post-package 顺序：
//      读取 .ccx → 确认是有效 archive → 检查内部结构 → 解压到临时目录
//      → 对解压内容运行完整 artifact verifier → 与 staging ARTIFACT_MANIFEST 比对 hash
//      → 全部通过 → 最后生成 .sha256 sidecar。
//      任何步骤失败：只打印简短 hash，不写正式 sidecar。
//   4. 明确记录 UDT 人工操作步骤；不声称已自动完成打包。
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';

import { verifyArtifact, verifyAgainstManifest } from './lib/verify-artifact.mjs';
import { COPYRIGHT_BANNER, AI_NOTICE } from './lib/legal-banner.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(SCRIPT_DIR, '..');
const STAGING_DIR = resolve(APP_DIR, 'release/uxp-production');

function log(msg) {
  console.error(`\x1b[36m[ccx]\x1b[0m ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`\x1b[31m[ccx]\x1b[0m ${msg}`);
  const err = new Error(msg);
  err.exitCode = code;
  throw err;
}

/**
 * 读取 staging BUILD_INFO.json。
 * @returns {object}
 */
function readStagingBuildInfo() {
  const p = join(STAGING_DIR, 'BUILD_INFO.json');
  if (!existsSync(p)) fail(`BUILD_INFO.json missing at ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Pre-package：验证 staging 可供 UDT 加载。
 * @returns {object} buildInfo
 */
export function prePackage() {
  log(`pre-package: verifying staging at ${STAGING_DIR}`);
  if (!existsSync(STAGING_DIR)) fail(`staging missing: ${STAGING_DIR}`);
  const info = readStagingBuildInfo();
  const result = verifyArtifact({
    stagingRoot: STAGING_DIR,
    expectedVersion: info.version,
    copyrightBanner: COPYRIGHT_BANNER,
    aiNotice: AI_NOTICE,
  });
  if (result.violations.length > 0) {
    for (const v of result.violations) fail(`pre-package verifier: ${v}`);
    process.exit(1);
  }
  log(`pre-package passed: version=${info.version} buildId=${info.buildId}`);
  log('UDT manual step: load this directory as the plugin root, then use "Package":');
  log(`  ${STAGING_DIR}`);
  log('Expected .ccx output: UDT prompts for output path; use name like imagen-ps-<version>.ccx');
  return info;
}

/**
 * 列出 .ccx 内部条目（只读，用系统 unzip -l）。
 * @param {string} ccxPath
 * @returns {string[]}
 */
function listCcxEntries(ccxPath) {
  const result = spawnSync('unzip', ['-l', ccxPath], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return [];
  }
  const lines = result.stdout.split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    // unzip -l 格式：  Length  Date  Time  Name，日期可能是 MM-DD-YYYY 或 YYYY-MM-DD
    const m = line.match(/^\s*\d+\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}\s+(.+)$/);
    if (m) entries.push(m[1].trim());
  }
  return entries.sort();
}

/**
 * 解压 .ccx 到临时目录（用系统 unzip）。
 * @param {string} ccxPath
 * @returns {string} 临时目录路径
 */
function extractCcx(ccxPath) {
  const tmp = mkdtempSync(join(tmpdir(), 'imagen-ccx-post-'));
  const result = spawnSync('unzip', ['-q', '-o', ccxPath, '-d', tmp], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error('unzip extraction failed (unzip not available or .ccx unreadable)');
  }
  return tmp;
}

/**
 * 找到解压目录中的 staging 根（manifest.json 所在目录）。
 * Adobe .ccx 解压后可能在根目录或某子目录含 manifest.json。
 * @param {string} extractRoot
 * @returns {string}
 */
function findManifestRoot(extractRoot) {
  if (existsSync(join(extractRoot, 'manifest.json'))) return extractRoot;
  const entries = readdirSync(extractRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sub = join(extractRoot, entry.name);
      if (existsSync(join(sub, 'manifest.json'))) return sub;
    }
  }
  throw new Error('manifest.json not found in .ccx extract root or first-level subdir');
}

/**
 * Post-package：完整正向验证。
 * @param {string} ccxPath
 * @returns {{sha256:string, size:number, entries:string[]}}
 */
export function postPackage(ccxPath) {
  if (!ccxPath) fail('post-package requires .ccx path');
  if (!existsSync(ccxPath)) fail(`.ccx not found: ${ccxPath}`);
  const buf = readFileSync(ccxPath);
  const size = buf.length;
  const sha256 = createHash('sha256').update(buf).digest('hex');
  log(`.ccx: ${ccxPath}`);
  log(`size: ${(size / 1024).toFixed(1)} KB`);
  log(`sha256: ${sha256}`);

  const violations = [];

  // 1. 列出内部条目（UDT 可能在根目录或子目录中打包，required/forbidden 检查基于 basename）
  const entries = listCcxEntries(ccxPath);
  if (entries.length === 0) {
    violations.push('could not list .ccx entries (unzip unavailable or unreadable)');
  }
  log(`internal entries: ${entries.length}`);
  const basenames = entries.map((e) => basename(e));
  for (const req of ['manifest.json', 'index.html']) {
    if (entries.length > 0 && !basenames.includes(req)) violations.push(`ccx missing required entry: ${req}`);
  }
  for (const entry of entries) {
    const base = basename(entry);
    if (base.endsWith('.map')) violations.push(`ccx contains source map: ${entry}`);
    if (base.endsWith('.ts') || base.endsWith('.tsx')) violations.push(`ccx contains TS source: ${entry}`);
    if (/\.env/i.test(base)) violations.push(`ccx contains env file: ${entry}`);
  }

  // 2. 解压并运行完整 verifier
  let extractDir = null;
  let manifestRoot = null;
  try {
    extractDir = extractCcx(ccxPath);
    manifestRoot = findManifestRoot(extractDir);
    log(`extracted manifest root: ${manifestRoot}`);
    const info = readStagingBuildInfo();
    const result = verifyArtifact({
      stagingRoot: manifestRoot,
      expectedVersion: info.version,
      copyrightBanner: COPYRIGHT_BANNER,
      aiNotice: AI_NOTICE,
    });
    for (const v of result.violations) violations.push(`ccx-content: ${v}`);
    // 3. 与 staging ARTIFACT_MANIFEST 比对 hash
    const manifestCheck = verifyAgainstManifest(manifestRoot);
    log(`manifest comparison: ${manifestCheck.checked} files checked`);
    for (const v of manifestCheck.violations) violations.push(`ccx-manifest: ${v}`);
  } catch (e) {
    violations.push(`ccx extraction/verification failed: ${e.message}`);
  } finally {
    if (extractDir) rmSync(extractDir, { recursive: true, force: true });
  }

  if (violations.length > 0) {
    for (const v of violations) fail(`post-package: ${v}`);
    log('post-package FAILED — no .sha256 sidecar written (artifact not validated).');
    process.exit(1);
  }

  // 全部通过后才写 sidecar
  const shaPath = ccxPath + '.sha256';
  writeFileSync(shaPath, `${sha256}  ${ccxPath.split('/').pop()}\n`);
  log(`post-package inspection passed. sha256 sidecar: ${shaPath}`);
  return { sha256, size, entries };
}

/**
 * 输出 packaged-build Photoshop smoke checklist（人工执行，不自动声称通过）。
 */
export function printSmokeChecklist() {
  const info = readStagingBuildInfo();
  console.error(`
\x1b[36m[ccx]\x1b[0m packaged-build Photoshop smoke checklist (MANUAL — do not claim passed without executing):

  1. Install the .ccx via UXP Developer Tool or double-click (Photoshop 26.1+ / UXP 8.1.0+).
  2. Confirm Photoshop loads the plugin panel ("Imagen").
  3. Open the main panel; verify no startup exception in PluginData/logs/.
  4. Verify manifest entrypoint renders.
  5. Verify static assets (icons) render with non-zero rect.
  6. Switch between core pages (Composer / Settings / History).
  7. Enable host smoke handle: localStorage.setItem('imagenPsHostSmoke', '1'); reload panel.
  8. Run: await globalThis.__IMAGEN_PS_HOST_SMOKE__.smokeJsquashPngEncoder()
     Confirm it returns ok=true, width=2, height=1.
  9. Read a Provider profile (mock profile if available) without paid API.
 10. Execute one mock/minimal link that does not require a paid API.
 11. Confirm production logs contain no debug noise (no React dev build markers).
 12. Close and reopen the panel; confirm it reloads cleanly.

  version=${info.version} buildId=${info.buildId}
`);
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'pre') {
    prePackage();
  } else if (cmd === 'post') {
    const ccxPath = process.argv[3];
    postPackage(ccxPath);
    printSmokeChecklist();
  } else if (cmd === 'checklist') {
    printSmokeChecklist();
  } else {
    console.error('Usage: build-ccx.mjs <pre|post <ccx-path>|checklist>');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`\x1b[31m[ccx]\x1b[0m ${err?.stack || err?.message || err}`);
    process.exit(err?.exitCode ?? 1);
  });
}

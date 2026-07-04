#!/usr/bin/env node
// Release verification gate。
//
// 合约：
//   1. 按顺序执行：pnpm validate → Production clean build → artifact verification →
//      license generation verification → build metadata verification → package readiness report。
//   2. 复用 pnpm validate（已覆盖 build + mock-only tests + policy）。
//   3. Production build 不依赖开发服务器。
//   4. 默认拒绝 dirty git working tree（release artifact 必须对应可复现 commit）；
//      --allow-dirty 仅用于本地演练，并明确输出 NON-RELEASABLE。
//   5. 任何 unresolved third-party license 在 release gate 中 hard fail，除非在
//      license-overrides.json 中显式 acknowledge。
//   6. 版本一致性：canonical source = manifest.json version；BUILD_INFO.version 必须一致；
//      传入 .ccx 时其文件名 version 必须一致。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGitState } from '../apps/app/scripts/lib/build-metadata.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const APP_DIR = resolve(REPO_ROOT, 'apps/app');
const STAGING_DIR = resolve(APP_DIR, 'release/uxp-production');

function log(msg) {
  console.error(`\x1b[36m[release-verify]\x1b[0m ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`\x1b[31m[release-verify]\x1b[0m ${msg}`);
  process.exit(code);
}

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit', env: process.env, ...opts });
  if (result.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${result.status ?? 1}`);
}

async function main() {
  const allowDirty = process.argv.includes('--allow-dirty');
  const ccxPath = process.argv.find((a) => a.endsWith('.ccx'));

  log('step 0: pre-checks (git tree state)');
  const git = readGitState(REPO_ROOT);
  if (git.commit === 'unknown') {
    log('WARNING: git commit unknown (no git environment)');
  }
  if (git.dirty && !allowDirty) {
    fail('release gate requires a clean git working tree (dirty tree is not reproducible). Use --allow-dirty for local rehearsal only.');
  }
  if (git.dirty && allowDirty) {
    log('NON-RELEASABLE: --allow-dirty set; artifact built from dirty tree. NOT for release.');
  }

  log('step 1/6: repository policy + build + mock-only tests (pnpm validate)');
  run('pnpm', ['validate']);

  log('step 2/6: production clean build + allowlist staging (atomic promotion)');
  run('pnpm', ['--filter', '@imagen-ps/app', 'build:production'], { cwd: REPO_ROOT });

  log('step 3/6: artifact verification');
  run('pnpm', ['--filter', '@imagen-ps/app', 'verify:production']);

  log('step 4/6: license generation verification (unresolved = hard fail)');
  const noticesPath = resolve(STAGING_DIR, 'THIRD_PARTY_NOTICES.txt');
  if (!existsSync(noticesPath)) fail('THIRD_PARTY_NOTICES.txt missing');
  const notices = readFileSync(noticesPath, 'utf8');
  if (notices.trim().length === 0) fail('THIRD_PARTY_NOTICES.txt is empty');
  if (notices.includes('License: UNKNOWN (resolve manually')) {
    fail('THIRD_PARTY_NOTICES.txt contains unresolved UNKNOWN licenses. Resolve via apps/app/scripts/lib/license-overrides.json or add LICENSE to the package.');
  }
  log(`notices: ${notices.split('========').length - 1} entries, all resolved`);

  log('step 5/6: build metadata + version consistency verification');
  const buildInfoPath = resolve(STAGING_DIR, 'BUILD_INFO.json');
  if (!existsSync(buildInfoPath)) fail('BUILD_INFO.json missing');
  const info = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
  const manifest = JSON.parse(readFileSync(resolve(STAGING_DIR, 'manifest.json'), 'utf8'));
  // canonical version = manifest
  if (info.version !== manifest.version) {
    fail(`version mismatch: BUILD_INFO=${info.version} manifest=${manifest.version}`);
  }
  if (info.commit === 'unknown') log('WARNING: git commit unknown');
  if (info.dirty === true && !allowDirty) {
    fail('BUILD_INFO marked dirty but --allow-dirty not set; release gate refuses dirty artifact.');
  }
  log(`canonical version (manifest)=${manifest.version}; BUILD_INFO.version=${info.version} — consistent`);
  log(`name=${info.name} version=${info.version} buildId=${info.buildId} commit=${info.commit} channel=${info.channel}`);

  if (ccxPath) {
    log(`step 5b: .ccx filename version consistency (${ccxPath})`);
    const m = basename(ccxPath).match(/(\d+\.\d+\.\d+)/);
    if (!m) fail(`.ccx filename does not contain a version: ${basename(ccxPath)}`);
    if (m[1] !== manifest.version) {
      fail(`.ccx filename version ${m[1]} != manifest version ${manifest.version}`);
    }
    log(`.ccx filename version ${m[1]} — consistent`);
  }

  log('step 6/6: package readiness report');
  log(`staging: ${STAGING_DIR}`);
  log('release gate passed. Next: ccx:pre, then UDT Package, then ccx:post <ccx-path>.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => fail(err.stack || err.message));
}

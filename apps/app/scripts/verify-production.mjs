#!/usr/bin/env node
// Standalone production artifact verifier。
// 对已存在的 staging 目录运行 verifier，不重新构建。
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

import { verifyArtifact, reportArtifact } from './lib/verify-artifact.mjs';
import { COPYRIGHT_BANNER, AI_NOTICE } from './lib/legal-banner.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(SCRIPT_DIR, '..');
const STAGING_DIR = resolve(APP_DIR, 'release/uxp-production');

function fail(msg, code = 1) {
  console.error(`\x1b[31m[verify]\x1b[0m ${msg}`);
  process.exit(code);
}

function log(msg) {
  console.error(`\x1b[36m[verify]\x1b[0m ${msg}`);
}

function main() {
  if (!existsSync(STAGING_DIR)) fail(`staging missing: ${STAGING_DIR}. Run pnpm build:production first.`);
  const buildInfoPath = join(STAGING_DIR, 'BUILD_INFO.json');
  let expectedVersion;
  if (existsSync(buildInfoPath)) {
    const info = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
    expectedVersion = info.version;
    log(`expected version=${expectedVersion} buildId=${info.buildId}`);
  }
  const result = verifyArtifact({
    stagingRoot: STAGING_DIR,
    expectedVersion,
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
  log(`ai-notice count=${result.aiNoticeCount} (expected 1), banner coverage=${result.bannerCoverage}/${result.bannerTotal}`);
  if (result.violations.length > 0) {
    for (const v of result.violations) fail(`verifier: ${v}`);
    process.exit(1);
  }
  log('artifact verification passed.');
}

main();

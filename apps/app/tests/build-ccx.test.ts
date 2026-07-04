import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { postPackage } from '../scripts/build-ccx.mjs';
import { COPYRIGHT_BANNER, AI_NOTICE } from '../scripts/lib/legal-banner.mjs';
import { generateArtifactManifest, serializeArtifactManifest } from '../scripts/lib/verify-artifact.mjs';

const hasZip = spawnSync('which', ['zip']).status === 0;
const hasUnzip = spawnSync('which', ['unzip']).status === 0;
const canZip = hasZip && hasUnzip;

// postPackage 从真实 staging 读取 BUILD_INFO 作为 expectedVersion，测试 .ccx 必须与其一致。
const ACTUAL_STAGING_BUILD_INFO = resolve(__dirname, '../release/uxp-production/BUILD_INFO.json');
function readActualVersion() {
  return JSON.parse(readFileSync(ACTUAL_STAGING_BUILD_INFO, 'utf8')).version;
}

describe('build-ccx', () => {
  describe('postPackage', () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'imagen-ccx-'));
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    function writeValidStaging(root: string, version = '1.0.0') {
      mkdirSync(join(root, 'assets'), { recursive: true });
      writeFileSync(
        join(root, 'manifest.json'),
        JSON.stringify({
          manifestVersion: 5,
          id: 'com.imagen-ps.panel',
          name: 'Imagen PS',
          version,
          main: 'index.html',
          host: { app: 'PS', minVersion: '26.1.0' },
          entrypoints: [{ type: 'panel', id: 'imagen-ps-panel' }],
        }),
      );
      writeFileSync(join(root, 'index.html'), '<!doctype html><html></html>');
      writeFileSync(join(root, 'assets/index.js'), COPYRIGHT_BANNER + '\n' + AI_NOTICE + '\nfunction main(){}');
      writeFileSync(join(root, 'LICENSE.txt'), 'MPL-2.0');
      writeFileSync(join(root, 'THIRD_PARTY_NOTICES.txt'), 'THIRD-PARTY NOTICES\n\nPackage: react\nLicense: MIT\n');
      writeFileSync(
        join(root, 'BUILD_INFO.json'),
        JSON.stringify({ version, buildId: `${version}+abcdef1`, commit: 'abcdef1', channel: 'production', name: 'Imagen PS' }),
      );
    }

    function zipStaging(stagingRoot: string, outPath: string) {
      const parent = join(stagingRoot, '..');
      const base = stagingRoot.split('/').pop()!;
      const result = spawnSync('zip', ['-r', outPath, base], { cwd: parent });
      if (result.status !== 0) throw new Error(`zip failed: ${result.stderr}`);
    }

    it.skipIf(!canZip)('passes post-package for a zipped staging directory and writes sidecar', () => {
      const version = readActualVersion();
      const staging = join(tmp, 'uxp-production');
      writeValidStaging(staging, version);
      // postPackage 会把 .ccx 内容与 staging 的 ARTIFACT_MANIFEST.json 做 hash 比对，测试 staging 需自带。
      const manifest = generateArtifactManifest(staging);
      writeFileSync(join(staging, 'ARTIFACT_MANIFEST.json'), serializeArtifactManifest(manifest));
      const ccxPath = join(tmp, `imagen-ps-${version}.ccx`);
      zipStaging(staging, ccxPath);
      const result = postPackage(ccxPath);
      expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(result.size).toBeGreaterThan(0);
      const sidecar = ccxPath + '.sha256';
      expect(existsSync(sidecar)).toBe(true);
      const sidecarText = readFileSync(sidecar, 'utf8');
      expect(sidecarText.startsWith(result.sha256)).toBe(true);
    });

    it.skipIf(!canZip)('rejects a .ccx missing manifest.json', () => {
      const badStaging = join(tmp, 'bad-staging');
      mkdirSync(badStaging, { recursive: true });
      writeFileSync(join(badStaging, 'index.html'), '<html></html>');
      const ccxPath = join(tmp, 'bad.ccx');
      zipStaging(badStaging, ccxPath);
      expect(() => postPackage(ccxPath)).toThrow(/ccx missing required entry: manifest\.json/);
      expect(existsSync(ccxPath + '.sha256')).toBe(false);
    });
  });
});

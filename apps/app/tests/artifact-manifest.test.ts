import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateArtifactManifest,
  serializeArtifactManifest,
  verifyAgainstManifest,
} from '../scripts/lib/verify-artifact.mjs';

describe('artifact-manifest', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'imagen-manifest-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('generateArtifactManifest', () => {
    it('lists every file with size + sha256, excluding ARTIFACT_MANIFEST.json itself', () => {
      writeFileSync(join(tmp, 'manifest.json'), '{}');
      mkdirSync(join(tmp, 'assets'), { recursive: true });
      writeFileSync(join(tmp, 'assets/index.js'), 'function f(){}');
      writeFileSync(join(tmp, 'ARTIFACT_MANIFEST.json'), '{}');
      const m = generateArtifactManifest(tmp);
      const paths = m.files.map((e) => e.path);
      expect(paths).toContain('manifest.json');
      expect(paths).toContain('assets/index.js');
      expect(paths).not.toContain('ARTIFACT_MANIFEST.json');
      for (const entry of m.files) {
        expect(typeof entry.size).toBe('number');
        expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('produces stable sorted output', () => {
      writeFileSync(join(tmp, 'b.txt'), 'b');
      writeFileSync(join(tmp, 'a.txt'), 'a');
      const m = generateArtifactManifest(tmp);
      expect(m.files.map((e) => e.path)).toEqual(['a.txt', 'b.txt']);
    });
  });

  describe('serializeArtifactManifest', () => {
    it('round-trips through JSON with trailing newline', () => {
      writeFileSync(join(tmp, 'a.txt'), 'a');
      const m = generateArtifactManifest(tmp);
      const text = serializeArtifactManifest(m);
      expect(text.endsWith('\n')).toBe(true);
      expect(JSON.parse(text)).toEqual(m);
    });
  });

  describe('verifyAgainstManifest', () => {
    it('passes when staging matches manifest', () => {
      writeFileSync(join(tmp, 'a.txt'), 'a');
      writeFileSync(join(tmp, 'b.txt'), 'b');
      const m = generateArtifactManifest(tmp);
      writeFileSync(join(tmp, 'ARTIFACT_MANIFEST.json'), serializeArtifactManifest(m));
      const result = verifyAgainstManifest(tmp);
      expect(result.violations).toEqual([]);
      expect(result.checked).toBe(2);
    });

    it('flags a file modified after manifest generation (sha256 mismatch)', () => {
      writeFileSync(join(tmp, 'a.txt'), 'original');
      const m = generateArtifactManifest(tmp);
      writeFileSync(join(tmp, 'ARTIFACT_MANIFEST.json'), serializeArtifactManifest(m));
      // 修改文件内容，hash 变化
      writeFileSync(join(tmp, 'a.txt'), 'modified');
      const result = verifyAgainstManifest(tmp);
      expect(result.violations.some((v) => v.includes('sha256 mismatch'))).toBe(true);
    });

    it('flags a file present in staging but missing from manifest', () => {
      writeFileSync(join(tmp, 'a.txt'), 'a');
      const m = generateArtifactManifest(tmp);
      writeFileSync(join(tmp, 'ARTIFACT_MANIFEST.json'), serializeArtifactManifest(m));
      // 新增未记录文件
      writeFileSync(join(tmp, 'extra.txt'), 'x');
      const result = verifyAgainstManifest(tmp);
      expect(result.violations.some((v) => v.includes('extra.txt') && v.includes('not in ARTIFACT_MANIFEST'))).toBe(true);
    });

    it('flags a file in manifest but missing from staging', () => {
      writeFileSync(join(tmp, 'a.txt'), 'a');
      const m = generateArtifactManifest(tmp);
      writeFileSync(join(tmp, 'ARTIFACT_MANIFEST.json'), serializeArtifactManifest(m));
      // 删除文件
      rmSync(join(tmp, 'a.txt'));
      const result = verifyAgainstManifest(tmp);
      expect(result.violations.some((v) => v.includes('missing file'))).toBe(true);
    });

    it('fails when ARTIFACT_MANIFEST.json is missing', () => {
      writeFileSync(join(tmp, 'a.txt'), 'a');
      const result = verifyAgainstManifest(tmp);
      expect(result.violations.some((v) => v.includes('ARTIFACT_MANIFEST.json missing'))).toBe(true);
    });
  });
});

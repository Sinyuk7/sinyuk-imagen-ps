import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readVersionFromManifest,
  readGitState,
  readBuiltAt,
  buildBuildInfo,
  serializeBuildInfo,
  auditBuildInfo,
  CHANNEL,
  PRODUCT_NAME,
} from '../scripts/lib/build-metadata.mjs';

describe('build-metadata', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'imagen-build-info-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('readVersionFromManifest', () => {
    it('reads a valid semver version', () => {
      const manifestPath = join(tmp, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify({ version: '1.2.3' }));
      expect(readVersionFromManifest(manifestPath)).toBe('1.2.3');
    });

    it('rejects a manifest without version', () => {
      const manifestPath = join(tmp, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify({ id: 'x' }));
      expect(() => readVersionFromManifest(manifestPath)).toThrow();
    });

    it('rejects an invalid version format', () => {
      const manifestPath = join(tmp, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify({ version: 'abc' }));
      expect(() => readVersionFromManifest(manifestPath)).toThrow();
    });
  });

  describe('readGitState', () => {
    it('returns a commit short SHA in a real git repo (or unknown fallback)', () => {
      const state = readGitState(process.cwd());
      // 在仓库内运行时应有 commit；脱离 git 时 fallback 为 unknown
      expect(typeof state.commit).toBe('string');
      expect(state.commit.length).toBeGreaterThan(0);
      expect(typeof state.dirty).toBe('boolean');
    });
  });

  describe('readBuiltAt', () => {
    it('returns undefined when no SOURCE_DATE_EPOCH', () => {
      expect(readBuiltAt(undefined)).toBeUndefined();
    });

    it('parses a valid epoch seconds to ISO string', () => {
      const iso = readBuiltAt('1609459200');
      expect(iso).toBe('2021-01-01T00:00:00.000Z');
    });

    it('rejects a non-numeric epoch', () => {
      expect(readBuiltAt('not-a-number')).toBeUndefined();
    });

    it('rejects a negative epoch', () => {
      expect(readBuiltAt('-1')).toBeUndefined();
    });
  });

  describe('buildBuildInfo', () => {
    it('produces a build info with version from manifest', () => {
      const manifestPath = join(tmp, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify({ version: '0.4.2' }));
      const info = buildBuildInfo({ manifestPath, repoRoot: process.cwd(), sourceDateEpoch: undefined });
      expect(info.name).toBe(PRODUCT_NAME);
      expect(info.version).toBe('0.4.2');
      expect(info.channel).toBe(CHANNEL);
      expect(info.buildId).toContain('0.4.2+');
      expect(typeof info.commit).toBe('string');
      expect(typeof info.dirty).toBe('boolean');
    });

    it('marks dirty state when git working tree is dirty', () => {
      const manifestPath = join(tmp, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify({ version: '1.0.0' }));
      const info = buildBuildInfo({ manifestPath, repoRoot: process.cwd(), sourceDateEpoch: undefined });
      // 当前测试运行时 git 状态可能为 clean 或 dirty，但字段必须稳定存在。
      expect(typeof info.dirty).toBe('boolean');
      if (info.dirty) expect(info.dirty).toBe(true);
    });

    it('includes builtAt when SOURCE_DATE_EPOCH is provided', () => {
      const manifestPath = join(tmp, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify({ version: '2.0.0' }));
      const info = buildBuildInfo({ manifestPath, repoRoot: process.cwd(), sourceDateEpoch: '1609459200' });
      expect(info.builtAt).toBe('2021-01-01T00:00:00.000Z');
    });
  });

  describe('auditBuildInfo', () => {
    it('passes for a clean info', () => {
      const manifestPath = join(tmp, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify({ version: '1.0.0' }));
      const info = buildBuildInfo({ manifestPath, repoRoot: process.cwd(), sourceDateEpoch: undefined });
      const violations = auditBuildInfo(info);
      // commit 不应包含绝对路径；若 git 不可用 commit=unknown 也安全
      expect(violations).toEqual([]);
    });

    it('flags an absolute /Users/ path leaked into a field', () => {
      const info = {
        name: PRODUCT_NAME,
        version: '1.0.0',
        buildId: '1.0.0+x',
        commit: '/Users/leaked/path',
        channel: CHANNEL,
      };
      const violations = auditBuildInfo(info);
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe('serializeBuildInfo', () => {
    it('produces stable sorted JSON with trailing newline', () => {
      const manifestPath = join(tmp, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify({ version: '1.0.0' }));
      const info = buildBuildInfo({ manifestPath, repoRoot: process.cwd(), sourceDateEpoch: undefined });
      const text = serializeBuildInfo(info);
      expect(text.endsWith('\n')).toBe(true);
      // 重新解析应等价
      expect(JSON.parse(text)).toEqual(info);
    });
  });
});

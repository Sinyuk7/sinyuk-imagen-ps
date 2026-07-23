import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkPaths } from '../../../../scripts/policy/paths.mjs';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeFixture(root: string, file: string): void {
  const filePath = join(root, file);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, '{"path":"/Users/test/generated"}\n');
}

describe('path policy', () => {
  it('ignores only Playwright generated files under apps/app/test-results', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'imagen-path-policy-'));
    temporaryRoots.push(repoRoot);

    writeFixture(repoRoot, 'apps/app/test-results/report.json');
    writeFixture(repoRoot, 'apps/app/test-results-copy/report.json');

    expect(checkPaths(repoRoot)).toEqual([
      expect.objectContaining({ file: 'apps/app/test-results-copy/report.json' }),
    ]);
  });
});

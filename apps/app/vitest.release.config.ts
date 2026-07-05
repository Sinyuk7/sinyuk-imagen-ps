/**
 * App release vitest 配置。
 *
 * 仅发现 apps/app/tests/release/ 下的 release 文件，并复用仓库级 globalSetup
 * 做 IMAGEN_TEST_LEVEL=release 双重校验。
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const globalSetup = resolve(repoRoot, 'scripts/release-global-setup.ts');

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/release/**/*.release.test.ts', 'tests/release/**/*.release.test.tsx'],
    exclude: [],
    cache: false,
    globalSetup: [globalSetup],
    maxWorkers: 1,
  },
});

/**
 * Release vitest 配置模板。
 *
 * 仅由 scripts/run-release-tests.mjs 以 `vitest run --config vitest.release.config.ts --no-cache` 调用，
 * 进程内已确认 IMAGEN_TEST_LEVEL=release（globalSetup 再次校验，防直接命中）。
 *
 * 新增 release 测试时：在对应包复制本文件即可。本配置只发现 tests/release/*.release.test.ts(x)，
 * 与开发 vitest.config.ts 的 exclude 互斥，故 `pnpm test` 永不命中 release 文件。
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
// 所有 workspace 包的 vitest.release.config.ts 都在 <pkg>/ 下，距仓库根两级。
const repoRoot = resolve(here, '../..');
const globalSetup = resolve(repoRoot, 'scripts/release-global-setup.ts');

export default defineConfig({
  test: {
    include: ['tests/release/**/*.release.test.ts', 'tests/release/**/*.release.test.tsx'],
    exclude: [],
    cache: false,
    globalSetup: [globalSetup],
  },
});

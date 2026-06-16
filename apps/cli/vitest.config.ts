import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 加载仓库根目录 .test.env（若存在）到 process.env，供 live smoke 用例使用。
    setupFiles: [resolve(import.meta.dirname, 'tests/setup.env.ts')],
    // e2e 子进程串行执行，避免临时 config 目录/进程退出竞争。
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // Allow smoke tests to import internal modules from workspace packages
      '@imagen-ps/application/src': resolve(root, 'packages/application/src'),
      '@imagen-ps/providers/src': resolve(root, 'packages/providers/src'),
    },
  },
});

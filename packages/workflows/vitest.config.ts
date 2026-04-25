import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Workflows 包的本地 Vitest 配置。
 *
 * 将跨包 workspace 依赖解析到源码入口，避免测试命中陈旧 dist 产物。
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@imagen-ps/core-engine': resolve(__dirname, '../core-engine/src/index.ts'),
      '@imagen-ps/providers': resolve(__dirname, '../providers/src/index.ts'),
    },
  },
});

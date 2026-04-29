import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Allow smoke tests to import internal modules from workspace packages
      '@imagen-ps/shared-commands/src': resolve(root, 'packages/shared-commands/src'),
      '@imagen-ps/providers/src': resolve(root, 'packages/providers/src'),
    },
  },
});

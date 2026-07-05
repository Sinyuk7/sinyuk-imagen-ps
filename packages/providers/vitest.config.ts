import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
    ],
    exclude: [
      ...configDefaults.exclude,
      '**/*.release.test.ts',
      '**/*.release.test.tsx',
    ],
  },
});

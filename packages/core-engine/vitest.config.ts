import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['src/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      '**/*.release.test.ts',
      '**/*.release.test.tsx',
    ],
  },
});

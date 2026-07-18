import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['tests/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      '**/*.release.test.ts',
      '**/*.release.test.tsx',
    ],
  },
});

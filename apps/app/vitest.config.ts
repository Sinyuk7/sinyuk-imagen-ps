import { defineConfig, configDefaults } from 'vitest/config';

const maxWorkers = process.env.VITEST_MAX_WORKERS ?? '4';

export default defineConfig({
  define: {
    __IMAGEN_PS_DEV__: 'true',
  },
  test: {
    environment: 'happy-dom',
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
    ],
    exclude: [
      ...configDefaults.exclude,
      '**/*.release.test.ts',
      '**/*.release.test.tsx',
    ],
    // Keep local full-suite runs from saturating the machine when multiple app tests overlap.
    maxWorkers,
    setupFiles: ['tests/setup.ts'],
  },
  esbuild: {
    // Let vitest find tsconfig from root
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        jsx: 'react-jsx',
      },
    },
  },
});

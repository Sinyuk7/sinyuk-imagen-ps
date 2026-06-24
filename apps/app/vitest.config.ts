import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'src/host/**/*.test.ts',
      'src/adapters/uxp/**/*.test.ts',
      'src/shells/uxp/**/*.test.tsx',
    ],
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

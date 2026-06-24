import { type UserConfig } from 'vite';

export const appViteBaseConfig = {
  base: './',
  publicDir: 'public',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
} satisfies UserConfig;

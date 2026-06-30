import { type UserConfig } from 'vite';

export const appViteBaseConfig = {
  base: './',
  publicDir: 'public',
  define: {
    __IMAGEN_PS_DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
} satisfies UserConfig;

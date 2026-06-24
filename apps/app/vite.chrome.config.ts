import { defineConfig, mergeConfig } from 'vite';
import { appViteBaseConfig } from './vite.base.config';

export default defineConfig(
  mergeConfig(appViteBaseConfig, {
    build: {
      outDir: 'dist-chrome',
      emptyOutDir: true,
      rollupOptions: {
        input: 'src/shells/chrome/index.html',
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  }),
);

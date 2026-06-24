import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { appViteBaseConfig } from './vite.base.config';

function chromeRootHtmlPlugin(): Plugin {
  return {
    name: 'imagen-ps-chrome-root-html',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist/web';
      const nestedHtml = resolve(outDir, 'src/shells/chrome/index.html');
      const rootHtml = resolve(outDir, 'index.html');
      try {
        mkdirSync(dirname(rootHtml), { recursive: true });
        renameSync(nestedHtml, rootHtml);
        rmSync(resolve(outDir, 'src'), { recursive: true, force: true });
      } catch {
        return;
      }
    },
  };
}

export default defineConfig(
  mergeConfig(appViteBaseConfig, {
    plugins: [chromeRootHtmlPlugin()],
    build: {
      outDir: 'dist/web',
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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
        const html = readFileSync(nestedHtml, 'utf8');
        // 从 src/shells/chrome/index.html 移到 dist/web/index.html 后，
        // Vite 生成的相对路径 ../../../assets/ 要改成基于产物根的 ./assets/。
        const fixedHtml = html.replace(/\.\.\/\.\.\/\.\.\/assets\//g, './assets/');
        mkdirSync(dirname(rootHtml), { recursive: true });
        writeFileSync(rootHtml, fixedHtml);
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

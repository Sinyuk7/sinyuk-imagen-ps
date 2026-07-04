// Vite Production UXP 配置。
//
// 合约：
//   1. 继承 vite.uxp.config.ts 的 UXP classic-script 兼容性（import.meta 替换、
//      bootstrap logger、inlineDynamicImports、单 bundle）。
//   2. Production 专用覆盖：
//      - sourcemap: false（彻底关闭，不生成 .map / inline / hidden）
//      - minify: 'esbuild'（JS minify）
//      - cssMinify: true（CSS minify）
//      - legalBannerPlugin()（copyright banner + AI notice）
//   3. 输出到 release/.uxp-production-raw（raw build），由编排脚本按 allowlist
//      拷贝到 release/uxp-production（最终 staging）。release/ 与 dist/ 物理隔离，
//      避免开发 build 的 emptyOutDir 清掉 production staging。
//   4. 不破坏 UXP host 所需 classic script 行为。
//
// 注：本文件是 .ts，由 Vite 的 esbuild config bundler 加载，可 import .ts 与 .mjs。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeConfig } from 'vite';
import { appViteBaseConfig } from './vite.base.config';
import { uxpImportMetaCompatPlugin, uxpClassicHtmlBootstrapPlugin } from './vite.uxp.config';
import { legalBannerPlugin, COPYRIGHT_BANNER } from './scripts/lib/legal-banner.mjs';
import { bundledPackagesPlugin } from './scripts/lib/bundled-packages.mjs';

/**
 * UXP bootstrap logger 是在 writeBundle 阶段由 uxpClassicHtmlBootstrapPlugin 写出的
 * 手写 IIFE，legal-banner 的 generateBundle 在其之前执行，无法覆盖它。本插件在
 * writeBundle 之后补上正式 copyright banner，使所有 emitted JS 都带声明。
 */
function bootstrapBannerPlugin() {
  return {
    name: 'imagen-ps-bootstrap-banner',
    enforce: 'post',
    writeBundle(options: any) {
      const outDir = options.dir ?? 'dist';
      const bootstrapPath = resolve(outDir, 'assets/uxp-bootstrap.js');
      if (!existsSync(bootstrapPath)) return;
      const code = readFileSync(bootstrapPath, 'utf8');
      if (code.includes(COPYRIGHT_BANNER)) return;
      writeFileSync(bootstrapPath, COPYRIGHT_BANNER + '\n' + code);
    },
  };
}

const productionOverrides = {
  plugins: [
    uxpImportMetaCompatPlugin(),
    uxpClassicHtmlBootstrapPlugin(),
    legalBannerPlugin(),
    bootstrapBannerPlugin(),
    bundledPackagesPlugin({ outPath: 'bundled-packages.json' }),
  ],
  build: {
    outDir: 'release/.uxp-production-raw',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    cssMinify: true,
    modulePreload: false,
    rollupOptions: {
      input: 'index.html',
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
};

export default mergeConfig(appViteBaseConfig, productionOverrides);

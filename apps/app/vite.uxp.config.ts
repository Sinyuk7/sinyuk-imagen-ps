import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { appViteBaseConfig } from './vite.base.config';

function uxpClassicScriptPlugin(): Plugin {
  return {
    name: 'imagen-ps-uxp-classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin src="(.+?)"><\/script>/g, '<script defer src="$1"></script>');
    },
  };
}

export default defineConfig(
  mergeConfig(appViteBaseConfig, {
    plugins: [uxpClassicScriptPlugin()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      modulePreload: false,
      rollupOptions: {
        input: 'index.html',
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  }),
);

import { defineConfig, type Plugin } from 'vite';

function uxpClassicScriptPlugin(): Plugin {
  return {
    name: 'imagen-ps-uxp-classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin src="(.+?)"><\/script>/g, '<script defer src="$1"></script>');
    },
  };
}

export default defineConfig({
  plugins: [uxpClassicScriptPlugin()],
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});

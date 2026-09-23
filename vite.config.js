import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// mode "single" はブラウザ試遊版(1ファイルHTML)用
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 2000,
  },
}));

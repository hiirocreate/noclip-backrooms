import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode "single" はブラウザ試遊版(1ファイルHTML)用
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 2000,
  },
}));

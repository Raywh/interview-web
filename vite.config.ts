import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  build: {
    outDir: 'dist',          // → web/dist（wrangler.toml 的 assets.directory）
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // 开发时把 /api 代理到 wrangler dev，保持同源 → cookie 与线上一致
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
});

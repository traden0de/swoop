import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

// Одна сборка, несколько страниц:
//   index.html   — главное окно Tauri на ПК
//   widget.html  — мини-виджет поверх всех окон
//   phone.html   — веб-приложение для iPhone (его раздаёт Rust-сервер по адресу "/")
//   creature.html — песочница персонажа (только для разработки)
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  base: '/',
  server: {
    port: 1420,
    strictPort: true,
    host: true, // доступно в локальной сети, чтобы открыть phone.html с iPhone во время разработки
    proxy: { '/api': { target: 'http://127.0.0.1:53917', ws: true } },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'safari15',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        widget: resolve(__dirname, 'widget.html'),
        phone: resolve(__dirname, 'phone.html'),
        creature: resolve(__dirname, 'creature.html'),
      },
    },
  },
});

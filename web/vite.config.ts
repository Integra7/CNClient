import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  // Для GitHub Pages: репо CNClient → сайт на https://<user>.github.io/CNClient/
  base: '/CNClient/',
  build: {
    // Папка docs в корне репо — в GitHub Pages укажите Source: ветка + /docs
    outDir: '../docs',
    target: 'es2022',
  },
  server: {
    port: 5173,
    open: true,
  },
});

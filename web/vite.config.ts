import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/CNClient/',
  build: {
    outDir: '../docs',
    target: 'es2022',
  },
  server: {
    port: 5173,
    open: true,
  },
});

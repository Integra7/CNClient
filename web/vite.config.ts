import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '.',
  base: '/CNClient/',
  plugins: [react()],
  build: {
    outDir: '../docs',
    target: 'es2022',
  },
  server: {
    port: 5173,
    open: true,
  },
});

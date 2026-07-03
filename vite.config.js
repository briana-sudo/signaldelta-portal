import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: '/signaldelta-portal/',
  // multi-page: serve each .html entry by its path in dev (no SPA index.html
  // fallback). The trading app has no client-side routing, so this is safe and is
  // the correct setting now that discovery.html is a second entry.
  appType: 'mpa',
  build: {
    rollupOptions: {
      // multi-page: the existing trading dashboard (index.html) is preserved; the
      // 3d-iii-b Discovery console is a SEPARATE entry (discovery.html).
      input: {
        main: resolve(__dirname, 'index.html'),
        discovery: resolve(__dirname, 'discovery.html'),
      },
    },
  },
});

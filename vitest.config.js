import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 2026-06-08: minimal vitest setup (devDeps only — not part of the Vite/Pages
// build). React plugin → automatic JSX runtime (matches the app build); jsdom
// env so window.HTMLMediaElement.prototype.play is mockable.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
});

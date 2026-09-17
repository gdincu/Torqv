import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built app works when installed/served from any path.
  base: './',
  build: { target: 'es2020' },
  server: { port: 5173 },
});

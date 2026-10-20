import { defineConfig } from 'vite';

// base: './' makes every asset URL relative, so the build works at the domain root
// AND under a GitHub Pages project path like https://user.github.io/dead-route/.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600, // Phaser alone is ~1.2 MB minified
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});

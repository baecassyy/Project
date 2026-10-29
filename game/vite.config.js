import { defineConfig } from 'vite';

// host: true exposes the dev server on your local network so a phone on the
// same Wi-Fi can open it at http://<your-computer-ip>:5173
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2018',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } }
  }
});

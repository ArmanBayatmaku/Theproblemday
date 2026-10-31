import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// The API server (server/index.ts) runs on :8787 during `npm run dev`; Vite proxies /api to it.
// The consumer app lives at /mobile/ (mobile/index.html → src/mobile).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    chunkSizeWarningLimit: 4000,
    // Two apps: the operations dashboard (/) and the consumer app (/mobile/).
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        mobile: fileURLToPath(new URL('./mobile/index.html', import.meta.url)),
      },
    },
  },
});

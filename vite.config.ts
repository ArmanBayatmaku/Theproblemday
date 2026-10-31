import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// The API server (server/index.ts) runs on :8787 during `npm run dev`; Vite proxies /api to it.
// Two entry points, one app: the website (/) and the phone app (/mobile/, phone-framed on a laptop).
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
    // The website (/) and the phone app (/mobile/) share all of src/.
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        mobile: fileURLToPath(new URL('./mobile/index.html', import.meta.url)),
      },
    },
  },
});

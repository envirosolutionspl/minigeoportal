import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Libraries change rarely and app code often; separate chunks keep the big ones cached.
        manualChunks(id) {
          if (/node_modules\/(ol|proj4|rbush|quickselect|pbf|earcut)\//.test(id)) return 'ol';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});

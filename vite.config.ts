import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadConfig } from './server/config/load.ts';
import { createSite, pickLocale, renderPage } from './server/html.ts';

/**
 * In development the page gets the configuration the way the server gives it (server/html.ts),
 * read anew for every page load, so an edited YAML file shows after a reload.
 */
function configPage(): Plugin {
  return {
    name: 'config-page',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html, { originalUrl }) {
        const site = createSite(loadConfig(process.env.CONFIG_DIR ?? 'config'));
        // The language the address names (/en/); the bare address shows the root language, else the default one.
        const url = new URL(originalUrl ?? '/', 'http://localhost');
        const { available, default: fallback, root } = site.config.app.locales;
        const locale = pickLocale(available, fallback, [url.pathname.split('/')[1], url.searchParams.get('lang') ?? undefined, root]);
        return renderPage(html, site.client(locale), site.config.skin);
      },
    },
  };
}

const API = `http://localhost:${process.env.API_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react(), tailwindcss(), configPage()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // The API (and the brand images it serves) in development; API_PORT is separate from PORT, which dev tooling may set for Vite itself.
    proxy: { '/api': API, '/brand': API },
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

import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Tests live next to the code as *.test.ts(x). Server tests run in Node,
 * app tests in jsdom (OpenLayers, DOMParser and React need a document).
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    css: false,
    projects: [
      {
        extends: true,
        test: { name: 'server', environment: 'node', include: ['server/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
});

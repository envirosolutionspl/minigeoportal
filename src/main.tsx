import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bootConfig, initConfig } from './config/runtime';
import { loadCapabilities } from './services/meta';
import './index.css';

// The configuration comes first: the app's modules read it as they load. The map needs the
// capabilities cache before it builds its layers, so the cache is fetched while the map library
// itself is still downloading, and the search provider loads alongside; none waits for another.
const capabilities = loadCapabilities();
initConfig(await bootConfig());
const search = import('./search').then((m) => m.loadSearchProvider());
const { default: App } = await import('./App');
await Promise.all([capabilities, search]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

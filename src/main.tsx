import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCapabilities } from './services/meta';
import './index.css';

// The map needs the capabilities cache before it builds its layers, so the cache is fetched
// while the map library itself is still downloading, and neither waits for the other.
const capabilities = loadCapabilities();
const { default: App } = await import('./App');
await capabilities;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

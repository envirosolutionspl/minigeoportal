import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadCapabilities } from './services/meta';
import './index.css';

// Layers are built from cached capabilities, so they are loaded before the first render.
await loadCapabilities();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

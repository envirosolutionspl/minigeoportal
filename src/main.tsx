import { StrictMode } from 'react';
import { bootConfig, initConfig } from './config/runtime';
import { loadCapabilities } from './services/meta';
import { start } from './start';
import './index.css';

// The configuration comes first: the app's modules read it as they load. The map needs the
// capabilities cache before it builds its layers, so the cache is fetched while the map library
// itself is still downloading. The search provider loads alongside and the map does not wait for
// it: the search box answers coordinates until then and takes the provider as it comes.
await start(document.getElementById('root')!, async () => {
  const capabilities = loadCapabilities();
  initConfig(await bootConfig());
  void import('./search').then((m) => m.loadSearchProvider());
  const { default: App } = await import('./App');
  await capabilities;
  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
});

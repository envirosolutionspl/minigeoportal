import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

/** The settings are read when the module loads, so every case loads it afresh with its own environment. */
async function settings(env: Record<string, string | undefined>) {
  for (const name of ['NODE_ENV', 'PORT', 'HOST', 'APP_ORIGIN', 'CONFIG_DIR', 'SHARED_DATA', 'DATA_DIR']) vi.stubEnv(name, env[name]);
  vi.resetModules();
  return import('./config.ts');
}

describe('config', () => {
  it('listens on 8787 of the loopback address and keeps its data under server/data by default', async () => {
    const { config, dataPath, production } = await settings({});
    expect(production).toBe(false);
    expect(config).toEqual({ port: 8787, host: '127.0.0.1', origin: undefined, configDir: 'config', sharedData: false });
    expect(dataPath('catalog.json')).toBe(resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'catalog.json'));
  });

  it('listens on every address in production unless HOST says otherwise', async () => {
    expect((await settings({ NODE_ENV: 'production' })).config.host).toBe('0.0.0.0');
    const { config, production } = await settings({ NODE_ENV: 'production', HOST: '10.0.0.5', PORT: '9000' });
    expect(production).toBe(true);
    expect(config).toMatchObject({ host: '10.0.0.5', port: 9000 });
  });

  it('takes the address, the directories and the shared data from the environment', async () => {
    const { config, dataPath } = await settings({
      APP_ORIGIN: 'https://staging.example',
      CONFIG_DIR: '/etc/minigeoportal',
      SHARED_DATA: '1',
      DATA_DIR: '/var/lib/minigeoportal',
    });
    expect(config).toMatchObject({ origin: 'https://staging.example', configDir: '/etc/minigeoportal', sharedData: true });
    expect(dataPath('dict', 'teryt.json')).toBe(resolve('/var/lib/minigeoportal', 'dict', 'teryt.json'));
    // Only the one value turns the sharing on.
    expect((await settings({ SHARED_DATA: 'true' })).config.sharedData).toBe(false);
  });

  it('names an error by its message, anything else by its text', async () => {
    const { errorMessage } = await settings({});
    expect(errorMessage(new Error('down'))).toBe('down');
    expect(errorMessage('down')).toBe('down');
    expect(errorMessage(404)).toBe('404');
  });
});

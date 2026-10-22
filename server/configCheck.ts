/** Checks a configuration directory without starting the server: `npm run config:check [directory]`. */
import { ConfigError, loadConfig } from './config/load.ts';

const dir = process.argv[2] ?? process.env.CONFIG_DIR ?? 'config';
try {
  const config = loadConfig(dir);
  const { overlays } = config.layers;
  console.log(
    `${dir}: OK (${config.app.locales.available.join(', ')}; ${config.map.baseMaps.length} base maps, ${overlays.length} layers)`,
  );
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  console.error(`${dir}: ${e.message}`);
  process.exitCode = 1;
}

import type { ClientConfig } from '../../shared/config.ts';
import type { AppFile } from '../config/schema.ts';
import * as gugik from './gugik/index.ts';

/**
 * Optional modules as the server reaches them: the only file of the server that imports a
 * module. Each module checks its part of the configuration, keeps its data, adds its routes and
 * names the hosts the page may ask directly; with the module off it does none of that.
 */

export type { Problem } from './gugik/index.ts';
export type { RouteDeps } from './gugik/index.ts';

/** What the modules keep while the server runs (their caches). */
export type ModuleData = gugik.Data;

/** Names of the enabled modules, whose texts (src/modules/<name>/i18n) join the app's own. */
export const enabled = (app: AppFile): string[] => (app.modules.gugik?.enabled ? ['gugik'] : []);

/** Rules of the modules across the configuration files. */
export const validate = gugik.validate;

/** Hosts the page asks directly (CSP connect-src), besides its own. */
export const connectSources = (client: ClientConfig): string[] => [...gugik.connectSources(client)];

/** A drawing order of the overlays from outside the configuration, when a module gives one. */
export const drawOrder = gugik.drawOrder;

/** Reads (or starts building) the modules' data as the server starts. */
export const start = gugik.start;

/** Refreshes the modules' data (npm run update). */
export const update = gugik.update;

/** A layer a module offers besides the configured ones (the geoportal catalog) that may be queried at a point. */
export const queryTarget = gugik.queryTarget;

/** The modules' routes of the API. */
export const routes = gugik.routes;

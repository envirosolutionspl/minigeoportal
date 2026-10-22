import { loadConfig } from './config/load.ts';
import { createSite } from './html.ts';

/** The default deployment (config/), for tests. */
export const site = createSite(loadConfig('config'));
export const defaults = site.defaults;

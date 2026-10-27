import { loadConfig } from './config/load.ts';
import { createSite } from './html.ts';

/** The default deployment (config/), for tests. */
export const site = createSite(loadConfig('config'));
export const defaults = site.defaults;

/** Request env the Node adapter would provide: a socket with the visitor's address (rate limits count by it). */
export const client = (address = '203.0.113.5') => ({
  incoming: { socket: { remoteAddress: address, remoteFamily: 'IPv4', remotePort: 1 } },
});

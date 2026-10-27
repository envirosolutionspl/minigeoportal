import type { TestProject } from 'vitest/node';
import type { ClientConfig } from '../../shared/config.ts';
import { clientConfig } from '../../server/config/client.ts';
import { loadConfig } from '../../server/config/load.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    config: ClientConfig;
  }
}

/**
 * The configuration the app receives (the default deployment, in Polish), read and checked once
 * for the whole run instead of once per test file; setup.ts hands it to the app's modules.
 */
export default function setup(project: TestProject) {
  project.provide('config', clientConfig(loadConfig('config'), 'pl'));
}

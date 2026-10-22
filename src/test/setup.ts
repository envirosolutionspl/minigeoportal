import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initConfig } from '@/config/runtime';
import { clientConfig } from '../../server/config/client.ts';
import { loadConfig } from '../../server/config/load.ts';

// The app's modules read the configuration as they load: the default deployment, in Polish.
initConfig(clientConfig(loadConfig('config'), 'pl'));

afterEach(() => cleanup());

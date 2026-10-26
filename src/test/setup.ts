import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initConfig } from '@/config/runtime';
import { clientConfig } from '../../server/config/client.ts';
import { loadConfig } from '../../server/config/load.ts';

// The app's modules read the configuration as they load: the default deployment, in Polish,
// with its search provider, as main.tsx starts the app.
initConfig(clientConfig(loadConfig('config'), 'pl'));
await (await import('@/search')).loadSearchProvider();
// The gugik module starts loading its place information parts as it loads; waited for here, so a
// test that resets the modules does not cut that import in half (it would read no configuration).
await import('@/modules/gugik/InfoParts');

// jsdom has <dialog> without the modal methods.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};

afterEach(() => cleanup());

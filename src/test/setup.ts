import { afterEach, inject } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initConfig } from '@/config/runtime';

// The app's modules read the configuration as they load: the default deployment, in Polish
// (globalSetup.ts), with its search provider, as main.tsx starts the app.
initConfig(inject('config'));
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
// OpenLayers watches the size of every map's target; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => cleanup());

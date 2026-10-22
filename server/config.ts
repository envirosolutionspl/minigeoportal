import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Server settings from the environment, read once at start (also from .env; every variable is
 * described in .env.example). Only TRUSTED_PROXY is read per request, in http.ts.
 */

export const production = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 8787),
  /** Behind a reverse proxy the server should listen on 127.0.0.1 only; see .env.example. */
  host: process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
  /** Public address of the app; bug reports may link only to it. */
  origin: process.env.APP_ORIGIN,
};

/** Files the server keeps between starts (caches), under server/data unless moved by DATA_DIR. */
export const dataPath = (...parts: string[]) =>
  resolve(process.env.DATA_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), 'data'), ...parts);

/** Text of an error for a log line or a status: the message, or the value itself when it is not an Error. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

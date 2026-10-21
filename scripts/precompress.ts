/**
 * Writes .br and .gz copies of the built assets, so the server sends them as they are
 * instead of compressing every response: `npm run build` runs it after Vite.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);
const COMPRESSIBLE = /\.(js|css|html|svg|json|txt|xml)$/;
const MIN_BYTES = 1024;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let count = 0;
for await (const file of walk('dist')) {
  if (!COMPRESSIBLE.test(file) || (await stat(file)).size < MIN_BYTES) continue;
  const data = await readFile(file);
  await writeFile(`${file}.br`, await brotli(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
  await writeFile(`${file}.gz`, await gz(data, { level: 9 }));
  count++;
}
console.log(`precompressed ${count} files`);

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { critical, refreshCache, update } = vi.hoisted(() => ({
  critical: vi.fn(async () => {}),
  refreshCache: vi.fn(),
  update: vi.fn(),
}));
vi.mock('./alerts.ts', () => ({ alertsTo: vi.fn(), alertOnCrash: vi.fn(), critical }));
vi.mock('./cache.ts', () => ({ refreshCache }));
vi.mock('./modules/index.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), update }));

/** Runs the script once; a failed run stops at process.exit, which throws here instead of ending the tests. */
async function run() {
  vi.resetModules();
  const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit ${code}`);
  });
  const done = await import('./update.ts').then(
    () => 'ok',
    (e: unknown) => (e as Error).message,
  );
  return { done, exit };
}

describe('update script', () => {
  beforeEach(() => {
    critical.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('refreshes the service metadata, then the data of the modules', async () => {
    refreshCache.mockResolvedValueOnce({ services: {} });
    update.mockResolvedValueOnce(undefined);
    const { done, exit } = await run();
    expect(done).toBe('ok');
    expect(exit).not.toHaveBeenCalled();
    expect(critical).not.toHaveBeenCalled();
  });

  it('mails a failed refresh of the metadata and ends with code 1, before touching the modules', async () => {
    const error = new Error('disk full');
    refreshCache.mockRejectedValueOnce(error);
    update.mockClear();
    const { done } = await run();
    expect(done).toBe('exit 1');
    expect(critical).toHaveBeenCalledWith('Data refresh failed', error);
    expect(update).not.toHaveBeenCalled();
  });

  it('mails a failed refresh of the modules and ends with code 1', async () => {
    const error = new Error('catalog: no previous catalog');
    refreshCache.mockResolvedValueOnce({ services: {} });
    update.mockRejectedValueOnce(error);
    const { done } = await run();
    expect(done).toBe('exit 1');
    expect(critical).toHaveBeenCalledWith('Data refresh failed', error);
  });
});

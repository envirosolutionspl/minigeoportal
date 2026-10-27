/**
 * Answers of a GUGiK index at a point, kept for a while: the time view asks for the middle of
 * the map on a 250 m grid, so visitors looking at the same area share one upstream request,
 * also while it is still on its way. Only answers are kept (no failures, no "busy"), the
 * oldest go first when the cache is full.
 */
export function pointCache<T>(ttlMs: number, maxEntries: number) {
  const entries = new Map<string, { at: number; value: T }>();
  const pending = new Map<string, Promise<T | undefined>>();
  return async (key: string, load: () => Promise<T | undefined>): Promise<T | undefined> => {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    let request = pending.get(key);
    if (!request) {
      request = load().finally(() => pending.delete(key));
      pending.set(key, request);
    }
    const value = await request;
    if (value === undefined) return undefined;
    entries.delete(key);
    entries.set(key, { at: Date.now(), value });
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    return value;
  };
}

/**
 * Names of the administrative units behind 6-digit municipality TERYT codes, from the
 * backend (which has the PRG lists cached). Search results use them to tell apart places
 * that share a name.
 */

export interface UnitNames {
  voivodeship: string;
  county: string;
  commune?: string;
}

const known = new Map<string, UnitNames>();

export async function unitNames(codes: string[], signal?: AbortSignal): Promise<Map<string, UnitNames>> {
  const missing = [...new Set(codes)].filter((c) => /^\d{6}$/.test(c) && !known.has(c));
  if (missing.length > 0) {
    try {
      const timeout = AbortSignal.timeout(4000);
      const res = await fetch(`/api/dict/jednostki?teryt=${missing.join(',')}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (res.ok) {
        for (const [code, names] of Object.entries((await res.json()) as Record<string, UnitNames>)) known.set(code, names);
      }
    } catch {
      // Names are a convenience; results are still shown without them.
    }
  }
  return new Map(codes.flatMap((c) => (known.has(c) ? [[c, known.get(c)!] as const] : [])));
}

/** Test hook: forgets the loaded names. */
export const clearUnitNames = () => known.clear();
